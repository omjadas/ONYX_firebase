const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

// // Create and Deploy Your First Cloud Functions
// // https://firebase.google.com/docs/functions/write-firebase-functions

exports.requestCarer = functions.https.onCall((data, context) => {
    // do stuff
});

exports.chatNotification = functions.firestore
    .document('chat_rooms/{chatId}/message/{messageId}')
    .onCreate((snap, context) => {
        const message = snap.data();
        var db = admin.firestore();
        db.collection('users').doc(message.receiverUid).get()
            .then(user => {
                if (!user.exists) {
                    console.log('No such document!');
                    return null;
                } else {
                    console.log('Document data:', user.data());
                    return user;
                }
            })
            .catch(err => {
                console.log('Error getting document', err);
            })
            .then(user => {
                var fcm = {
                    data: {
                        title: message.sender,
                        message: message.message,
                        username: message.sender,
                        uid: message.senderUid
                        //TODO: add fcm_token
                    },
                    token: user.get('firebaseToken')
                }
                admin.messaging().send(fcm);
                return null;
            })
            .catch();
    })