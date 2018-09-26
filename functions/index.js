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

        var sender = db.collection('users').doc(message.senderUid).get()
            .then(sender => {
                if (!sender.exists) {
                    console.log('No such document!');
                    return null;
                } else {
                    console.log('Document data:', sender.data());
                    return sender;
                }
            })
            .catch(err => {
                console.log('Error getting document', err);
            })

        var receiver = db.collection('users').doc(message.receiverUid).get()
            .then(receiver => {
                if (!receiver.exists) {
                    console.log('No such document!');
                    return null;
                } else {
                    console.log('Document data:', receiver.data());
                    return receiver;
                }
            })
            .catch(err => {
                console.log('Error getting document', err);
            })

        Promise.all([sender, receiver])
            .then(([sender, receiver]) => {
                var fcm = {
                    data: {
                        type: "chat",
                        title: message.sender,
                        message: message.message,
                        username: message.sender,
                        uid: message.senderUid,
                        fcm_token: sender.get('firebaseToken')
                    },
                    token: receiver.get('firebaseToken')
                }
                admin.messaging().send(fcm);
                return null;
            })
            .catch();
    })