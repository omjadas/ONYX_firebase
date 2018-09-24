const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

// // Create and Deploy Your First Cloud Functions
// // https://firebase.google.com/docs/functions/write-firebase-functions

exports.requestCarer = functions.https.onCall((data, context) => {
    var db = admin.firestore();
    var user = db.collection('users').doc(context.auth.uid).get()
        .then(doc => {
            if (!doc.exists) {
                console.log('No such document!');
                return null;
            } else {
                console.log('Document data:', doc.data());
                return doc.data();
            }
        })
        .catch(err => {
            console.log('Error getting document', err);
        });

    var carers = user.then(user => {
        return db.collection('users').where('isCarer','==','true').where('currentLocation' > user.currentLocation).get()
    });

    Promise.all([user, carers])
        .then(([user, carers]) => {
            carers.forEach(carer => {
                // check if carer is close to user and send message
            })
            return;
        }).catch();
});