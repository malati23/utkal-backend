const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const Application = require('../models/Application');
const User = require('../models/User');
const { generateTempPassword } = require('../utils/generatePassword');
const { sendCredentialsEmail } = require('../utils/sendEmail');

/**
 * Generate unique Member ID in format NUF-M-0001, NUF-M-0002, etc.
 */
const generateMemberId = async () => {
  let maxNum = 0;

  // Search existing users and applications with NUF-M-XXXX format
  const usersWithMemberId = await User.find({ memberId: /^NUF-M-\d+$/ }).select('memberId');
  const appsWithMemberId = await Application.find({ memberId: /^NUF-M-\d+$/ }).select('memberId');

  const allMemberIds = [
    ...usersWithMemberId.map((u) => u.memberId),
    ...appsWithMemberId.map((a) => a.memberId),
  ].filter(Boolean);

  allMemberIds.forEach((idStr) => {
    const match = idStr.match(/NUF-M-(\d+)/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  });

  let nextNumber = maxNum + 1;
  let isUnique = false;
  let candidateId = '';
  let attempts = 0;

  while (!isUnique && attempts < 50) {
    candidateId = `NUF-M-${String(nextNumber).padStart(4, '0')}`;
    const existingUser = await User.findOne({ memberId: candidateId });
    const existingApp = await Application.findOne({ memberId: candidateId });

    if (!existingUser && !existingApp) {
      isUnique = true;
    } else {
      nextNumber++;
      attempts++;
    }
  }

  return candidateId;
};

/**
 * @desc    Create a new membership application
 * @route   POST /api/applications
 * @access  Public
 */
const createApplication = async (req, res) => {
  console.log("POST /api/applications received");
  try {
    const formData = req.body || {};

    const personal = formData.personal || formData.personalDetails || {};
    const address = formData.address || formData.addressDetails || {};
    const account = formData.account || {};
    const nominee = formData.nominee || formData.nomineeDetails || {};
    const shares = formData.shares || formData.membershipDetails || {};
    const documents = formData.documents || formData.documentDetails || {};
    const witness = formData.witness || formData.witnessDetails || {};
    const declaration = formData.declaration || formData.declarationDetails || {};

    // Basic Validation
    const email = address.email || account.email || formData.email;
    const mobile = address.mobile || account.mobile || formData.mobile;
    const firstName = personal.firstName;
    const lastName = personal.lastName;

    if (!firstName || !lastName) {
      return res.status(400).json({
        success: false,
        message: 'Applicant first name and last name are required',
      });
    }

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Valid email address is required',
      });
    }

    if (!mobile) {
      return res.status(400).json({
        success: false,
        message: 'Valid mobile number is required',
      });
    }

    // Generate safe unique Application ID: NUF-1001, NUF-1002, etc.
    let generatedAppId = '';
    let isUnique = false;
    let attempts = 0;

    const lastApplication = await Application.findOne({ applicationId: /^NUF-\d+$/ })
      .sort({ createdAt: -1 })
      .exec();

    let nextNumber = 1001;
    if (lastApplication && lastApplication.applicationId) {
      const match = lastApplication.applicationId.match(/NUF-(\d+)/);
      if (match) {
        nextNumber = Math.max(1001, parseInt(match[1], 10) + 1);
      }
    }

    while (!isUnique && attempts < 20) {
      generatedAppId = `NUF-${nextNumber}`;
      const existing = await Application.findOne({ applicationId: generatedAppId });
      if (!existing) {
        isUnique = true;
      } else {
        nextNumber++;
        attempts++;
      }
    }

    // Extract uploaded files from req.files or pre-uploaded file URLs in req.body
    const reqFiles = req.files || {};
    const payment = formData.payment || formData.paymentDetails || {};

    const idProofUrl = reqFiles.idProof?.[0]
      ? `/uploads/documents/${reqFiles.idProof[0].filename}`
      : (typeof documents.idProofUrl === 'string' && documents.idProofUrl
        ? documents.idProofUrl
        : (typeof documents.idProofFile === 'string' ? documents.idProofFile : ''));

    const addressProofUrl = reqFiles.addressProof?.[0]
      ? `/uploads/documents/${reqFiles.addressProof[0].filename}`
      : (typeof documents.addressProofUrl === 'string' && documents.addressProofUrl
        ? documents.addressProofUrl
        : (typeof documents.addressProofFile === 'string' ? documents.addressProofFile : ''));

    const photoUrl = reqFiles.photo?.[0]
      ? `/uploads/documents/${reqFiles.photo[0].filename}`
      : (typeof documents.photoUrl === 'string' && documents.photoUrl
        ? documents.photoUrl
        : (typeof documents.photoFile === 'string' ? documents.photoFile : ''));

    const signatureUrl = reqFiles.signature?.[0]
      ? `/uploads/documents/${reqFiles.signature[0].filename}`
      : (typeof documents.signatureUrl === 'string' && documents.signatureUrl
        ? documents.signatureUrl
        : (typeof documents.signatureFile === 'string' ? documents.signatureFile : ''));

    const paymentReceiptUrl = reqFiles.paymentReceipt?.[0]
      ? `/uploads/documents/${reqFiles.paymentReceipt[0].filename}`
      : (reqFiles.receiptFile?.[0]
        ? `/uploads/documents/${reqFiles.receiptFile[0].filename}`
        : (typeof payment.receiptUrl === 'string' && payment.receiptUrl
          ? payment.receiptUrl
          : (typeof payment.receiptFile === 'string'
            ? payment.receiptFile
            : (typeof payment.receiptFile?.previewUrl === 'string'
              ? payment.receiptFile.previewUrl
              : (documents.paymentReceiptUrl || '')))));

    // Process additional documents array if passed or if extra files uploaded
    let additionalDocs = Array.isArray(documents.additionalDocuments)
      ? [...documents.additionalDocuments]
      : [];

    const extraFieldMappings = [
      { field: 'doc3_eduCert', type: 'Educational Certificate', name: 'Educational Degree Certificate' },
      { field: 'doc4_birthCert', type: 'Birth Certificate', name: 'Birth Certificate' },
      { field: 'doc5_utility', type: 'Utility Bill', name: 'Electricity / Utility Bill' },
      { field: 'panCard', type: 'PAN Card', name: 'PAN Card' },
      { field: 'incomeCert', type: 'Income Certificate', name: 'Income Certificate' },
    ];

    extraFieldMappings.forEach((mapping) => {
      if (reqFiles[mapping.field]?.[0]) {
        additionalDocs.push({
          documentType: mapping.type,
          documentName: mapping.name,
          documentUrl: `/uploads/documents/${reqFiles[mapping.field][0].filename}`,
          uploadedAt: new Date(),
        });
      }
    });

    if (paymentReceiptUrl) {
      additionalDocs.push({
        documentType: 'Payment Receipt',
        documentName: '₹200 Statutory Membership Payment Screenshot',
        documentUrl: paymentReceiptUrl,
        uploadedAt: new Date(),
      });
    }

    const sanitizedDocuments = {
      idProofType: documents.idProofType || 'Aadhaar Card',
      idProofUrl: idProofUrl,
      addressProofType: documents.addressProofType || 'Aadhaar Card',
      addressProofUrl: addressProofUrl,
      photoUrl: photoUrl,
      signatureUrl: signatureUrl,
      paymentReceiptUrl: paymentReceiptUrl,
      additionalDocuments: additionalDocs,
    };

    const applicationData = {
      applicationId: generatedAppId,
      status: 'pending',
      submittedAt: new Date(),
      personalDetails: {
        title: personal.title || '',
        firstName: personal.firstName || '',
        middleName: personal.middleName || '',
        lastName: personal.lastName || '',
        relationshipPrefix: personal.relationshipPrefix || '',
        fatherLegalName: personal.fatherLegalName || '',
        dob: personal.dob || '',
        age: personal.age ? String(personal.age) : '',
        gender: personal.gender || '',
        maritalStatus: personal.maritalStatus || '',
        education: personal.education || '',
        religion: personal.religion || 'Hinduism',
        category: personal.category || '',
        occupation: personal.occupation || '',
      },
      contactDetails: {
        mobile: mobile,
        email: email,
      },
      addressDetails: {
        address1: address.address1 || '',
        address2: address.address2 || '',
        villageTown: address.villageTown || '',
        district: address.district || '',
        state: address.state || 'Odisha',
        pincode: address.pincode || '',
        country: address.country || 'India',
        sameAsResidential: address.sameAsResidential !== false,
        commAddress1: address.commAddress1 || '',
        commAddress2: address.commAddress2 || '',
        commVillageTown: address.commVillageTown || '',
        commDistrict: address.commDistrict || '',
        commState: address.commState || 'Odisha',
        commPincode: address.commPincode || '',
        commCountry: address.commCountry || 'India',
      },
      nomineeDetails: {
        fullName: nominee.fullName || (nominee.firstName ? `${nominee.firstName} ${nominee.lastName || ''}`.trim() : ''),
        relationship: nominee.relationship || '',
        dob: nominee.dob || '',
        mobile: nominee.mobile || '',
        address: nominee.address || '',
        sameAsApplicant: nominee.sameAsApplicant !== false,
        isMinor: nominee.isMinor === true,
        guardianName: nominee.guardianName || '',
        guardianRelationship: nominee.guardianRelationship || '',
      },
      membershipDetails: {
        membershipType: account.membershipType || 'Associate Member',
        membershipAmount: account.membershipAmount || '200',
        preferredCommunication: account.preferredCommunication || 'Both',
        numberOfShares: Number(shares.numberOfShares) || 10,
        shareValue: Number(shares.shareValue) || 10,
        processingFee: Number(shares.processingFee) || 100,
        totalContribution: Number(shares.totalContribution) || 200,
      },
      paymentDetails: {
        method: payment.method || payment.paymentMethod || 'UPI (IndusInd Bank QR)',
        amount: Number(payment.amount) || Number(shares.totalContribution) || 200,
        utrNumber: payment.utrNumber || payment.utr || 'UPI_ATTACHED',
        receiptUrl: paymentReceiptUrl,
        receiptFileName: payment.receiptFileName || payment.receiptFile?.name || 'UPI_Payment_Receipt.png',
        paymentStatus: 'pending',
        paidAt: new Date(),
      },
      documentDetails: sanitizedDocuments,
      witnessDetails: {
        witness1Name: witness.witness1Name || '',
        witness1Mobile: witness.witness1Mobile || '',
        witness1Address: witness.witness1Address || '',
        witness1Occupation: witness.witness1Occupation || '',
        witness1Relationship: witness.witness1Relationship || '',
        witness2Name: witness.witness2Name || '',
        witness2Mobile: witness.witness2Mobile || '',
        witness2Address: witness.witness2Address || '',
        witness2Occupation: witness.witness2Occupation || '',
        witness2Relationship: witness.witness2Relationship || '',
      },
      declarationDetails: {
        confirmInfoTrue: declaration.confirmInfoTrue === true,
        agreeTerms: declaration.agreeTerms === true,
        consentProcessing: declaration.consentProcessing === true,
        signatureName: declaration.signatureName || '',
        declarationDate: declaration.declarationDate || new Date().toISOString().split('T')[0],
      },
    };

    const newApplication = await Application.create(applicationData);
    console.log(`Application saved successfully: ${newApplication.applicationId}`);

    return res.status(201).json({
      success: true,
      message: 'Application submitted successfully',
      application: newApplication,
    });
  } catch (error) {
    console.error('Error creating application:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to submit application',
    });
  }
};

/**
 * @desc    Get all membership applications
 * @route   GET /api/applications
 * @access  Public / Admin
 */
const getApplications = async (req, res) => {
  try {
    const applications = await Application.find().sort({ createdAt: -1 });
    return res.status(200).json({
      success: true,
      count: applications.length,
      applications,
    });
  } catch (error) {
    console.error('Error fetching applications:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch applications',
    });
  }
};

/**
 * @desc    Update application status (Admin approval API)
 * @route   PATCH /api/applications/:id/status
 * @access  Public / Admin
 */
const updateApplicationStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const allowedStatuses = ['pending', 'approved', 'rejected'];

    if (!status || !allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Allowed statuses are: pending, approved, rejected',
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({
        success: false,
        message: 'Application not found',
      });
    }

    const application = await Application.findById(id);

    if (!application) {
      return res.status(404).json({
        success: false,
        message: 'Application not found',
      });
    }

    // APPROVAL FLOW
    if (status === 'approved') {
      // 1. Verify current status is pending
      if (application.status !== 'pending') {
        if (application.status === 'approved') {
          const existingUser = await User.findOne({
            $or: [
              { applicationId: application._id },
              ...(application.memberId ? [{ memberId: application.memberId }] : []),
              ...(application.contactDetails?.email ? [{ email: application.contactDetails.email.toLowerCase() }] : []),
            ],
          });
          return res.status(200).json({
            success: true,
            message: 'Application is already approved',
            applicationId: application.applicationId || application._id.toString(),
            memberId: application.memberId || existingUser?.memberId,
            alreadyApproved: true,
            emailSent: application.credentialsEmailStatus === 'sent',
            application,
            member: existingUser
              ? {
                _id: existingUser._id,
                memberId: existingUser.memberId,
                name: existingUser.name,
                email: existingUser.email,
                mobile: existingUser.mobile,
                role: existingUser.role,
                status: existingUser.status,
                mustChangePassword: existingUser.mustChangePassword ?? false,
                applicationId: existingUser.applicationId,
              }
              : null,
          });
        }
        return res.status(400).json({
          success: false,
          message: `Cannot approve application. Current status is "${application.status}". Only pending applications can be approved.`,
        });
      }

      // Extract applicant details
      const email = application.contactDetails?.email;
      const mobile = application.contactDetails?.mobile || '';

      if (!email) {
        return res.status(400).json({
          success: false,
          message: 'Application contact email is missing. Cannot create member login account.',
        });
      }

      const p = application.personalDetails || {};
      const nameParts = [p.title, p.firstName, p.middleName, p.lastName].filter(Boolean);
      const name = nameParts.length > 0 ? nameParts.join(' ') : 'Applicant';

      // 2. Duplicate Account Prevention
      const existingUser = await User.findOne({
        $or: [
          { email: email.toLowerCase() },
          { applicationId: application._id },
        ],
      });

      if (existingUser) {
        // If user already exists, link and return without creating duplicate
        application.status = 'approved';
        application.memberId = existingUser.memberId;
        application.reviewedAt = application.reviewedAt || new Date();
        await application.save();

        return res.status(200).json({
          success: true,
          message: `Application approved. Connected to existing member account for ${email}`,
          applicationId: application.applicationId || application._id.toString(),
          memberId: existingUser.memberId,
          alreadyExists: true,
          application,
          member: {
            _id: existingUser._id,
            memberId: existingUser.memberId,
            name: existingUser.name,
            email: existingUser.email,
            mobile: existingUser.mobile,
            role: existingUser.role,
            status: existingUser.status,
            mustChangePassword: existingUser.mustChangePassword ?? false,
            applicationId: existingUser.applicationId,
          },
        });
      }

      // 3. Generate Unique Member ID (Format: NUF-M-0001)
      const memberId = await generateMemberId();

      // 4. Generate Temporary Password & Hash with bcrypt
      const tempPassword = generateTempPassword(10);
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(tempPassword, salt);

      // 5. Create Member/User Account
      let newMember;
      try {
        newMember = await User.create({
          name,
          email: email.toLowerCase().trim(),
          mobile,
          password: hashedPassword,
          role: 'member',
          status: 'active',
          memberId,
          applicationId: application._id,
          mustChangePassword: true,
        });
      } catch (userError) {
        console.error('Error creating user account:', userError);
        return res.status(500).json({
          success: false,
          message: userError.message || 'Failed to create member account. Application remains pending.',
        });
      }

      // Safe required development logs
      console.log(`Application approved: ${application.applicationId || application._id}`);
      console.log(`Member created: ${memberId}`);

      // 6. Update Application Document
      try {
        application.status = 'approved';
        application.memberId = memberId;
        application.reviewedAt = new Date();
        application.credentialsEmailStatus = 'pending';
        await application.save();
      } catch (appError) {
        console.error('Error saving application. Rolling back user creation:', appError);
        // Safety Rollback
        await User.findByIdAndDelete(newMember._id);
        return res.status(500).json({
          success: false,
          message: 'Failed to update application status. User account creation rolled back.',
        });
      }

      // 7. Dispatch Credentials Email via Nodemailer
      let emailSent = false;
      let emailError = null;
      try {
        const emailResult = await sendCredentialsEmail({
          email: email.toLowerCase().trim(),
          name,
          applicationId: application.applicationId || application._id.toString(),
          memberId,
          tempPassword,
        });

        emailSent = emailResult.success === true;
        if (!emailSent && emailResult.error) {
          emailError = emailResult.error;
        }
      } catch (mailErr) {
        console.error(`Credentials email failed: ${mailErr.message}`);
        emailError = mailErr.message;
      }

      // 8. ONLY mark as sent if Nodemailer succeeded, otherwise failed
      application.credentialsEmailStatus = emailSent ? 'sent' : 'failed';
      await application.save();

      // 9. Sanitized Member Response (No password or hash returned)
      const memberResponse = {
        _id: newMember._id,
        memberId: newMember.memberId,
        name: newMember.name,
        email: newMember.email,
        mobile: newMember.mobile,
        role: newMember.role,
        status: newMember.status,
        mustChangePassword: newMember.mustChangePassword,
        applicationId: newMember.applicationId,
        createdAt: newMember.createdAt,
      };

      return res.status(200).json({
        success: true,
        message: emailSent
          ? 'Application approved and member account created successfully. Credentials emailed to applicant.'
          : 'Application approved and member account created successfully.',
        applicationId: application.applicationId || application._id.toString(),
        memberId,
        emailSent,
        emailError: emailError || undefined,
        credentialsEmailStatus: application.credentialsEmailStatus,
        application,
        member: memberResponse,
      });
    }

    // For rejection or resetting to pending
    application.status = status;
    if (status === 'rejected') {
      application.reviewedAt = new Date();
    }

    await application.save();

    const actionText = status === 'rejected' ? 'rejected' : 'updated';

    return res.status(200).json({
      success: true,
      message: `Application ${actionText} successfully`,
      application,
    });
  } catch (error) {
    console.error('Error updating application status:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to update application status',
    });
  }
};

/**
 * @desc    Update/Edit membership application details (Admin edit API)
 * @route   PUT /api/applications/:id
 * @access  Admin
 */
const updateApplication = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body || {};

    let application = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      application = await Application.findById(id);
    }
    if (!application) {
      application = await Application.findOne({ applicationId: id });
    }

    if (!application) {
      return res.status(404).json({
        success: false,
        message: 'Application not found',
      });
    }

    // Update personal details
    if (updateData.personalDetails) {
      const current = application.personalDetails?.toObject?.() || application.personalDetails || {};
      application.personalDetails = {
        ...current,
        ...updateData.personalDetails,
      };
    }

    // Update contact details
    if (updateData.contactDetails) {
      const current = application.contactDetails?.toObject?.() || application.contactDetails || {};
      application.contactDetails = {
        ...current,
        ...updateData.contactDetails,
      };
    }

    // Update address details
    if (updateData.addressDetails) {
      const current = application.addressDetails?.toObject?.() || application.addressDetails || {};
      application.addressDetails = {
        ...current,
        ...updateData.addressDetails,
      };
    }

    // Update nominee details
    if (updateData.nomineeDetails) {
      const current = application.nomineeDetails?.toObject?.() || application.nomineeDetails || {};
      application.nomineeDetails = {
        ...current,
        ...updateData.nomineeDetails,
      };
    }

    // Update membership details
    if (updateData.membershipDetails) {
      const current = application.membershipDetails?.toObject?.() || application.membershipDetails || {};
      application.membershipDetails = {
        ...current,
        ...updateData.membershipDetails,
      };
    }

    // Flat fields convenience
    if (updateData.pan) {
      if (!application.personalDetails) application.personalDetails = {};
      application.personalDetails.pan = updateData.pan;
    }
    if (updateData.branch) {
      if (!application.membershipDetails) application.membershipDetails = {};
      application.membershipDetails.branch = updateData.branch;
    }
    if (updateData.introducer) {
      if (!application.membershipDetails) application.membershipDetails = {};
      application.membershipDetails.introducer = updateData.introducer;
    }
    if (updateData.altMobile) {
      if (!application.contactDetails) application.contactDetails = {};
      application.contactDetails.altMobile = updateData.altMobile;
    }

    // If status is provided and valid
    if (updateData.status && ['pending', 'approved', 'rejected', 'correction_required'].includes(updateData.status.toLowerCase())) {
      application.status = updateData.status.toLowerCase();
    }

    application.reviewedAt = new Date();
    await application.save();

    // Keep linked User account in sync if member exists
    const linkedUser = await User.findOne({ applicationId: application._id });
    if (linkedUser) {
      const p = application.personalDetails || {};
      const nameParts = [p.title, p.firstName, p.middleName, p.lastName].filter(Boolean);
      if (nameParts.length > 0) linkedUser.name = nameParts.join(' ');
      if (application.contactDetails?.email) linkedUser.email = application.contactDetails.email.toLowerCase();
      if (application.contactDetails?.mobile) linkedUser.mobile = application.contactDetails.mobile;
      await linkedUser.save();
    }

    return res.status(200).json({
      success: true,
      message: 'Application updated successfully',
      application,
    });
  } catch (error) {
    console.error('Error updating application:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to update application',
    });
  }
};

/**
 * @desc    Upload documents standalone endpoint
 * @route   POST /api/applications/upload-documents
 * @access  Public
 */
const uploadDocuments = async (req, res) => {
  try {
    const uploadedFiles = {};
    if (req.files) {
      if (Array.isArray(req.files)) {
        req.files.forEach((file) => {
          uploadedFiles[file.fieldname] = `/uploads/documents/${file.filename}`;
        });
      } else {
        Object.keys(req.files).forEach((fieldname) => {
          const fileArr = req.files[fieldname];
          if (fileArr && fileArr.length > 0) {
            uploadedFiles[fieldname] = `/uploads/documents/${fileArr[0].filename}`;
          }
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Files uploaded successfully',
      files: uploadedFiles,
    });
  } catch (error) {
    console.error('Error uploading documents:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to upload files',
    });
  }
};

/**
 * @desc    Get real document details for all applications from MongoDB
 * @route   GET /api/applications/documents
 * @access  Public / Admin
 */
const getApplicationDocuments = async (req, res) => {
  try {
    const applications = await Application.find().sort({ createdAt: -1 });

    const documentsData = applications.map((app) => {
      const p = app.personalDetails || {};
      const c = app.contactDetails || {};
      const doc = app.documentDetails || {};

      const nameParts = [p.title, p.firstName, p.middleName, p.lastName].filter(Boolean);
      const applicantName = nameParts.length > 0 ? nameParts.join(' ') : 'Applicant';

      return {
        _id: app._id,
        applicationId: app.applicationId || app._id.toString(),
        memberId: app.memberId || null,
        applicantName,
        email: c.email || '',
        mobile: c.mobile || '',
        status: app.status || 'pending',
        submittedAt: app.submittedAt || app.createdAt,

        // Complete documentDetails object from MongoDB schema
        documentDetails: {
          idProofType: doc.idProofType || '',
          idProofUrl: doc.idProofUrl || '',
          addressProofType: doc.addressProofType || '',
          addressProofUrl: doc.addressProofUrl || '',
          photoUrl: doc.photoUrl || '',
          signatureUrl: doc.signatureUrl || '',
          additionalDocuments: Array.isArray(doc.additionalDocuments) ? doc.additionalDocuments : [],
        },

        // Pre-extracted list of uploaded documents
        documents: (() => {
          const list = [];
          const defaultVerification = app.status === 'approved' ? 'Verified' : app.status === 'rejected' ? 'Rejected' : 'Pending Verification';

          const idType = (doc.idProofType || 'Aadhaar Card').trim();
          const addrType = (doc.addressProofType || 'Aadhaar Card').trim();
          const isIdAadhaar = idType.toLowerCase().includes('aadhaar');
          const isAddrAadhaar = addrType.toLowerCase().includes('aadhaar');
          const isSameUrl = doc.idProofUrl && doc.addressProofUrl && doc.idProofUrl === doc.addressProofUrl;

          if (doc.idProofUrl) {
            const isCombined = (isIdAadhaar && isAddrAadhaar) || isSameUrl;
            list.push({
              id: `${app._id}-idproof`,
              documentType: isCombined ? 'Identity & Address Proof' : 'Identity Proof',
              documentName: isCombined
                ? `${idType} (Identity & Address Proof)`
                : `${idType} (ID Proof)`,
              documentUrl: doc.idProofUrl,
              uploadedAt: app.submittedAt || app.createdAt,
              verificationStatus: defaultVerification,
            });
          }

          if (doc.addressProofUrl) {
            // Only add separate address proof if it's NOT a duplicate of Aadhaar card / same file URL
            const isDuplicateAadhaar = isAddrAadhaar && (isIdAadhaar || isSameUrl);
            if (!doc.idProofUrl) {
              list.push({
                id: `${app._id}-addressproof`,
                documentType: 'Address Proof',
                documentName: `${addrType || 'Address Document'} (Address Proof)`,
                documentUrl: doc.addressProofUrl,
                uploadedAt: app.submittedAt || app.createdAt,
                verificationStatus: defaultVerification,
              });
            } else if (!isDuplicateAadhaar && !list.some(d => d.documentUrl === doc.addressProofUrl)) {
              list.push({
                id: `${app._id}-addressproof`,
                documentType: 'Address Proof',
                documentName: `${addrType || 'Address Document'} (Address Proof)`,
                documentUrl: doc.addressProofUrl,
                uploadedAt: app.submittedAt || app.createdAt,
                verificationStatus: defaultVerification,
              });
            }
          }

          if (doc.photoUrl) {
            list.push({
              id: `${app._id}-photo`,
              documentType: 'Photograph',
              documentName: 'Passport Photograph',
              documentUrl: doc.photoUrl,
              uploadedAt: app.submittedAt || app.createdAt,
              verificationStatus: defaultVerification,
            });
          }

          if (doc.signatureUrl) {
            list.push({
              id: `${app._id}-signature`,
              documentType: 'Signature',
              documentName: 'Digital Signature Specimen',
              documentUrl: doc.signatureUrl,
              uploadedAt: app.submittedAt || app.createdAt,
              verificationStatus: defaultVerification,
            });
          }

          const receiptUrl = doc.paymentReceiptUrl || app.paymentDetails?.receiptUrl;
          if (receiptUrl && !list.some(d => d.documentUrl === receiptUrl)) {
            list.push({
              id: `${app._id}-paymentreceipt`,
              documentType: 'Payment Receipt',
              documentName: '₹200 Statutory Membership Payment Screenshot',
              documentUrl: receiptUrl,
              uploadedAt: app.submittedAt || app.createdAt,
              verificationStatus: defaultVerification,
            });
          }

          if (Array.isArray(doc.additionalDocuments)) {
            doc.additionalDocuments.forEach((addDoc, idx) => {
              if (addDoc.documentUrl && !list.some(d => d.documentUrl === addDoc.documentUrl)) {
                list.push({
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

          return list;
        })(),
      };
    });

    // Provide allDocuments alias on each item for frontend backward compatibility
    documentsData.forEach((item) => {
      item.allDocuments = item.documents;
    });

    return res.status(200).json({
      success: true,
      count: documentsData.length,
      documents: documentsData,
    });
  } catch (error) {
    console.error('Error fetching application documents:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch application documents',
    });
  }
};

/**
 * @desc    Resend member credentials email for an approved application
 * @route   POST /api/applications/:id/resend-credentials
 * @access  Public / Admin
 */
const resendMemberCredentials = async (req, res) => {
  try {
    const { id } = req.params;

    let application = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      application = await Application.findById(id);
    }
    if (!application) {
      application = await Application.findOne({ applicationId: id });
    }

    if (!application) {
      return res.status(404).json({
        success: false,
        message: 'Application not found',
      });
    }

    if (application.status !== 'approved' || !application.memberId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot resend credentials. Application is not approved yet or has no member ID assigned.',
      });
    }

    const email = (application.contactDetails?.email || '').trim();
    if (!email) {
      application.credentialsEmailStatus = 'failed';
      await application.save();
      return res.status(400).json({
        success: false,
        message: 'Application has no registered contact email.',
      });
    }

    const existingUser = await User.findOne({
      $or: [
        { memberId: application.memberId },
        { applicationId: application._id },
        { email: email.toLowerCase() },
      ],
    });

    if (!existingUser) {
      return res.status(404).json({
        success: false,
        message: `Member account not found for Member ID "${application.memberId}"`,
      });
    }

    // Generate new secure temporary password
    const tempPassword = generateTempPassword(10);
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(tempPassword, salt);

    // Update existing member password
    existingUser.password = hashedPassword;
    existingUser.mustChangePassword = true;
    await existingUser.save();

    const p = application.personalDetails || {};
    const nameParts = [p.title, p.firstName, p.middleName, p.lastName].filter(Boolean);
    const name = nameParts.length > 0 ? nameParts.join(' ') : existingUser.name || 'Member';

    // Safe development log
    console.log(`Resending credentials email for Member: ${application.memberId} (${application.applicationId || application._id})`);

    // Dispatch credentials email
    let emailSent = false;
    let emailError = null;
    try {
      const emailResult = await sendCredentialsEmail({
        email,
        name,
        applicationId: application.applicationId || application._id.toString(),
        memberId: application.memberId,
        tempPassword,
      });

      emailSent = emailResult.success === true;
      if (!emailSent && emailResult.error) {
        emailError = emailResult.error;
      }
    } catch (mailErr) {
      console.error(`Credentials email failed: ${mailErr.message}`);
      emailError = mailErr.message;
    }

    // Update status based on email delivery
    application.credentialsEmailStatus = emailSent ? 'sent' : 'failed';
    await application.save();

    if (!emailSent) {
      return res.status(500).json({
        success: false,
        message: `Failed to dispatch email: ${emailError || 'SMTP Error'}`,
        applicationId: application.applicationId || application._id.toString(),
        memberId: application.memberId,
        credentialsEmailStatus: 'failed',
      });
    }

    return res.status(200).json({
      success: true,
      message: `Credentials email resent successfully to ${email}`,
      applicationId: application.applicationId || application._id.toString(),
      memberId: application.memberId,
      emailSent: true,
      credentialsEmailStatus: 'sent',
    });
  } catch (error) {
    console.error('Error resending credentials:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to resend credentials',
    });
  }
};

module.exports = {
  createApplication,
  getApplications,
  updateApplicationStatus,
  updateApplication,
  getApplicationDocuments,
  uploadDocuments,
  resendMemberCredentials,
};

