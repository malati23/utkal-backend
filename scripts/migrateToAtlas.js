/**
 * Migration Script: Local MongoDB -> MongoDB Atlas
 * Copies all collections (users, applications, members, payments, deposits, notices, transactions)
 * from local MongoDB instance to MongoDB Atlas without overwriting or duplicating.
 */

const mongoose = require('mongoose');

const LOCAL_URI = 'mongodb://127.0.0.1:27017/new-utkal-finance';
const ATLAS_URI = 'mongodb+srv://bhuyanmalati476_db_user:2V7KeJ3QFqdqqLbE@cluster0.za9s3ki.mongodb.net/new-utkal-finance?retryWrites=true&w=majority';

async function migrate() {
  console.log('--- Starting Migration from Local MongoDB to MongoDB Atlas ---');

  let localConn = null;
  let atlasConn = null;

  try {
    console.log('Connecting to Local MongoDB...');
    localConn = await mongoose.createConnection(LOCAL_URI).asPromise();
    console.log('Connected to Local MongoDB.');

    console.log('Connecting to MongoDB Atlas...');
    atlasConn = await mongoose.createConnection(ATLAS_URI).asPromise();
    console.log('Connected to MongoDB Atlas.');

    const localCollections = await localConn.db.listCollections().toArray();
    console.log(`Found ${localCollections.length} collections in Local DB.\n`);

    for (const colInfo of localCollections) {
      const colName = colInfo.name;
      if (colName.startsWith('system.')) continue;

      const localCol = localConn.collection(colName);
      const atlasCol = atlasConn.collection(colName);

      const docs = await localCol.find({}).toArray();
      console.log(`Collection "${colName}": Found ${docs.length} local documents.`);

      if (docs.length === 0) {
        console.log(` - Skipping empty collection "${colName}".\n`);
        continue;
      }

      let insertedCount = 0;
      let skippedCount = 0;

      for (const doc of docs) {
        try {
          const exists = await atlasCol.findOne({ _id: doc._id });
          if (!exists) {
            await atlasCol.insertOne(doc);
            insertedCount++;
          } else {
            skippedCount++;
          }
        } catch (itemErr) {
          console.error(`   Error migrating doc ${doc._id} in "${colName}":`, itemErr.message);
        }
      }

      console.log(` - Completed "${colName}": ${insertedCount} newly inserted, ${skippedCount} already existed in Atlas.\n`);
    }

    console.log('--- Migration Completed Successfully! ---');
  } catch (error) {
    console.error('Migration failed:', error.message);
  } finally {
    if (localConn) await localConn.close();
    if (atlasConn) await atlasConn.close();
  }
}

migrate();
