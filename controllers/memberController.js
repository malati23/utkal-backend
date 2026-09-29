const mongoose = require('mongoose');
const Application = require('../models/Application');
const User = require('../models/User');

/**
 * Helper to format date into '29 Sep 2026'
 */
const formatDate = (dateInput) => {
  if (!dateInput) return 'N/A';
  try {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return 'N/A';
    return d.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch (e) {
    return 'N/A';
  }
};

/**
 * @desc    Get all real approved members from MongoDB
 * @route   GET /api/members
 * @access  Public / Admin
 */
const getMembers = async (req, res) => {
  try {
    // 1. Find all applications with status "approved"
    const approvedApps = await Application.find({ status: 'approved' }).sort({ createdAt: -1 });

    // 2. Find all users with role "member"
    const memberUsers = await User.find({ role: 'member' });

    // Create lookup map of users by memberId and by applicationId
    const userByMemberIdMap = {};
    const userByAppIdMap = {};

    memberUsers.forEach((u) => {
      if (u.memberId) userByMemberIdMap[u.memberId] = u;
      if (u.applicationId) userByAppIdMap[u.applicationId.toString()] = u;
    });

    const membersList = approvedApps.map((app) => {
      const p = app.personalDetails || {};
      const c = app.contactDetails || {};
      const a = app.addressDetails || {};
      const n = app.nomineeDetails || {};
      const m = app.membershipDetails || {};
      const doc = app.documentDetails || {};

      const nameParts = [p.title, p.firstName, p.middleName, p.lastName].filter(Boolean);
      const applicantName = nameParts.length > 0 ? nameParts.join(' ') : 'Applicant';

      const userRecord = userByMemberIdMap[app.memberId] || userByAppIdMap[app._id.toString()];

      const memberId = app.memberId || (userRecord ? userRecord.memberId : 'NUF-M-0001');
      const membershipStatus = userRecord ? (userRecord.status === 'inactive' ? 'Inactive' : 'Active') : 'Active';

      // Build document items list for this member
      const documentsList = [];
      const defaultVerification = 'Verified';

      if (doc.idProofUrl) {
        documentsList.push({
          id: `${app._id}-idproof`,
          documentType: 'Identity Proof',
          documentName: `${doc.idProofType || 'Government ID'} (ID Proof)`,
          documentUrl: doc.idProofUrl,
          uploadedAt: app.submittedAt || app.createdAt,
          verificationStatus: defaultVerification,
        });
      }

      if (doc.addressProofUrl) {
        documentsList.push({
          id: `${app._id}-addressproof`,
          documentType: 'Address Proof',
          documentName: `${doc.addressProofType || 'Address Document'} (Address Proof)`,
          documentUrl: doc.addressProofUrl,
          uploadedAt: app.submittedAt || app.createdAt,
          verificationStatus: defaultVerification,
        });
      }

      if (doc.photoUrl) {
        documentsList.push({
          id: `${app._id}-photo`,
          documentType: 'Photograph',
          documentName: 'Passport Photograph',
          documentUrl: doc.photoUrl,
          uploadedAt: app.submittedAt || app.createdAt,
          verificationStatus: defaultVerification,
        });
      }

      if (doc.signatureUrl) {
        documentsList.push({
          id: `${app._id}-signature`,
          documentType: 'Signature',
          documentName: 'Digital Signature Specimen',
          documentUrl: doc.signatureUrl,
          uploadedAt: app.submittedAt || app.createdAt,
          verificationStatus: defaultVerification,
        });
      }

      if (Array.isArray(doc.additionalDocuments)) {
        doc.additionalDocuments.forEach((addDoc, idx) => {
          if (addDoc.documentUrl) {
            documentsList.push({
              id: addDoc._id ? addDoc._id.toString() : `${app._id}-add-${idx}`,
              documentType: addDoc.documentType || 'Additional Document',
              documentName: addDoc.documentName || addDoc.documentType || 'Supporting Document',
              documentUrl: addDoc.documentUrl,
              uploadedAt: addDoc.uploadedAt || app.submittedAt || app.createdAt,
              verificationStatus: defaultVerification,
            });
          }
        });
      }

      return {
        _id: app._id,
        id: memberId,
        memberId,
        applicationId: app.applicationId || app._id.toString(),
        name: applicantName,
        applicantName,
        email: c.email || (userRecord ? userRecord.email : ''),
        mobile: c.mobile || (userRecord ? userRecord.mobile : ''),
        membershipType: m.membershipType || 'Associate Member',
        membershipAmount: m.membershipAmount || '200',
        numberOfShares: m.numberOfShares || 10,
        shareValue: m.shareValue || 10,
        processingFee: m.processingFee || 100,
        totalContribution: m.totalContribution || 200,
        status: membershipStatus.toLowerCase(),
        membershipStatus,
        joiningDate: formatDate(app.reviewedAt || app.submittedAt || app.createdAt),
        createdAt: app.reviewedAt || app.submittedAt || app.createdAt,
        personalDetails: p,
        contactDetails: c,
        addressDetails: a,
        nomineeDetails: n,
        membershipDetails: m,
        documentDetails: doc,
        documents: documentsList,
        appRecord: app,
      };
    });

    return res.status(200).json({
      success: true,
      count: membersList.length,
      members: membersList,
    });
  } catch (error) {
    console.error('Error fetching members:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch members',
    });
  }
};

/**
 * @desc    Get single member details by memberId or applicationId or _id
 * @route   GET /api/members/:id
 * @access  Public / Admin
 */
const getMemberById = async (req, res) => {
  try {
    const { id } = req.params;

    let app = await Application.findOne({
      $or: [
        { memberId: id },
        { applicationId: id },
        ...(mongoose.Types.ObjectId.isValid(id) ? [{ _id: id }] : []),
      ],
      status: 'approved',
    });

    if (!app) {
      return res.status(404).json({
        success: false,
        message: `Approved member not found for ID "${id}"`,
      });
    }

    const userRecord = await User.findOne({
      $or: [
        { memberId: app.memberId },
        { applicationId: app._id },
        { email: app.contactDetails?.email },
      ],
    });

    const p = app.personalDetails || {};
    const c = app.contactDetails || {};
    const a = app.addressDetails || {};
    const n = app.nomineeDetails || {};
    const m = app.membershipDetails || {};
    const doc = app.documentDetails || {};

    const nameParts = [p.title, p.firstName, p.middleName, p.lastName].filter(Boolean);
    const applicantName = nameParts.length > 0 ? nameParts.join(' ') : 'Applicant';
    const memberId = app.memberId || (userRecord ? userRecord.memberId : id);
    const membershipStatus = userRecord ? (userRecord.status === 'inactive' ? 'Inactive' : 'Active') : 'Active';

    // Documents list
    const documentsList = [];
    if (doc.idProofUrl) {
      documentsList.push({
        id: `${app._id}-idproof`,
        documentType: 'Identity Proof',
        documentName: `${doc.idProofType || 'Government ID'} (ID Proof)`,
        documentUrl: doc.idProofUrl,
        uploadedAt: app.submittedAt || app.createdAt,
        verificationStatus: 'Verified',
      });
    }
    if (doc.addressProofUrl) {
      documentsList.push({
        id: `${app._id}-addressproof`,
        documentType: 'Address Proof',
        documentName: `${doc.addressProofType || 'Address Document'} (Address Proof)`,
        documentUrl: doc.addressProofUrl,
        uploadedAt: app.submittedAt || app.createdAt,
        verificationStatus: 'Verified',
      });
    }
    if (doc.photoUrl) {
      documentsList.push({
        id: `${app._id}-photo`,
        documentType: 'Photograph',
        documentName: 'Passport Photograph',
        documentUrl: doc.photoUrl,
        uploadedAt: app.submittedAt || app.createdAt,
        verificationStatus: 'Verified',
      });
    }
    if (doc.signatureUrl) {
      documentsList.push({
        id: `${app._id}-signature`,
        documentType: 'Signature',
        documentName: 'Digital Signature Specimen',
        documentUrl: doc.signatureUrl,
        uploadedAt: app.submittedAt || app.createdAt,
        verificationStatus: 'Verified',
      });
    }
    if (Array.isArray(doc.additionalDocuments)) {
      doc.additionalDocuments.forEach((addDoc, idx) => {
        if (addDoc.documentUrl) {
          documentsList.push({
            id: addDoc._id ? addDoc._id.toString() : `${app._id}-add-${idx}`,
            documentType: addDoc.documentType || 'Additional Document',
            documentName: addDoc.documentName || addDoc.documentType || 'Supporting Document',
            documentUrl: addDoc.documentUrl,
            uploadedAt: addDoc.uploadedAt || app.submittedAt || app.createdAt,
            verificationStatus: 'Verified',
          });
        }
      });
    }

    const memberData = {
      _id: app._id,
      id: memberId,
      memberId,
      applicationId: app.applicationId || app._id.toString(),
      name: applicantName,
      applicantName,
      email: c.email || (userRecord ? userRecord.email : ''),
      mobile: c.mobile || (userRecord ? userRecord.mobile : ''),
      membershipType: m.membershipType || 'Associate Member',
      membershipAmount: m.membershipAmount || '200',
      numberOfShares: m.numberOfShares || 10,
      shareValue: m.shareValue || 10,
      processingFee: m.processingFee || 100,
      totalContribution: m.totalContribution || 200,
      status: membershipStatus.toLowerCase(),
      membershipStatus,
      joiningDate: formatDate(app.reviewedAt || app.submittedAt || app.createdAt),
      createdAt: app.reviewedAt || app.submittedAt || app.createdAt,
      personalDetails: p,
      contactDetails: c,
      addressDetails: a,
      nomineeDetails: n,
      membershipDetails: m,
      documentDetails: doc,
      documents: documentsList,
      appRecord: app,
    };

    return res.status(200).json({
      success: true,
      member: memberData,
    });
  } catch (error) {
    console.error('Error fetching member details:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch member details',
    });
  }
};

/**
 * @desc    Toggle/Update member status (Active / Inactive)
 * @route   PATCH /api/members/:id/status
 * @access  Public / Admin
 */
const updateMemberStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // 'Active', 'Inactive', 'active', 'inactive'

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Status is required',
      });
    }

    const newStatus = status.toLowerCase() === 'active' ? 'active' : 'inactive';

    const user = await User.findOne({
      $or: [
        { memberId: id },
        ...(mongoose.Types.ObjectId.isValid(id) ? [{ _id: id }, { applicationId: id }] : []),
      ],
    });

    if (user) {
      user.status = newStatus;
      await user.save();
    }

    return res.status(200).json({
      success: true,
      message: `Member status updated to ${newStatus}`,
      memberId: id,
      status: newStatus === 'active' ? 'Active' : 'Inactive',
    });
  } catch (error) {
    console.error('Error updating member status:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to update member status',
    });
  }
};

module.exports = {
  getMembers,
  getMemberById,
  updateMemberStatus,
};
