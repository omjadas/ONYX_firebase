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
            } else {
                console.log('Document data:', doc.data());
            }
            return;
        })
        .catch(err => {
            console.log('Error getting document', err);
        });
    user.currentLocation;

    // do stuff
});
