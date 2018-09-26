const functions = require('firebase-functions');
const admin = require('firebase-admin');
const geolib = require('geolib');
admin.initializeApp();

// // Create and Deploy Your First Cloud Functions
// // https://firebase.google.com/docs/functions/write-firebase-functions

exports.requestCarer = functions.https.onCall((data, context) => {
    var radius = 500;
    var db = admin.firestore();
    var user = db.collection('users').doc(context.auth.uid).get()
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
        });

    var carers = user.then(user => {
        var currentLocation = geoPointToGeolib(user.data().currentLocation);
        var small = geolib.computeDestinationPoint(currentLocation, radius, 180);
        var large = geolib.computeDestinationPoint(currentLocation, radius, 0);
        return db.collection('users').where('isCarer', '==', true)
            .where('currentLocation', '>=', new admin.firestore.GeoPoint(small.latitude, small.longitude))
            .where('currentLocation', '<=', new admin.firestore.GeoPoint(large.latitude, large.longitude)).get();
    });

    return Promise.all([user, carers])
        .then(([user, carers]) => {
            if (carers.size) {
                carers.forEach(carer => {
                    if (geolib.getDistance(geoPointToGeolib(user.get(currentLocation)), geoPointToGeolib(carer.get("currentLocation"))) < radius) {
                        var message = {
                            data: {
                                type: 'carerRequest',
                                senderId: user.id,
                                senderName: user.get('firstName')
                            },
                            token: carer.get('firebaseToken')
                        };
                        admin.messaging().send(message)
                    }
                });
                return "Waiting for carer";
            } else {
                return "No carers found";
            }
        }).catch();
});

function geoPointToGeolib(geopoint) {
    return {
        latitude: geopoint.latitude,
        longitude: geopoint.longitude
    }
}

exports.chatNotification = functions.firestore
    .document('chat_rooms/{chatId}/message/{messageId}')
    .onCreate((snap, context) => {
        const message = snap.data();
        var db = admin.firestore();

        return db.collection('users').doc(message.receiverUid).get()
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
            .then(receiver => {
                var fcm = {
                    data: {
                        type: "chat",
                        title: message.sender,
                        text: message.message,
                        username: message.sender,
                        uid: message.senderUid
                    },
                    token: receiver.get('firebaseToken')
                }
                admin.messaging().send(fcm);
                return null;
            })
            .catch();
    })

exports.addContact = functions.https.onCall((data, context) => {
    var db = admin.firestore();
    var userRefs = db.collection('users');

    var user = userRefs.where('email', '==', data.email).get()
        .then(users => {
            var returnUser = null;
            users.forEach(user => {
                returnUser = user;
            });
            return returnUser;
        })

    var alreadyAdded = user.then(user => {
        return db.collection('users').doc(context.auth.uid).collection('contacts').doc(user.id).get()
    })
        .then((docSnapshot) => {
            if (docSnapshot.exists) {
                return true;
            }
            return false;
        })

    return Promise.all([user, alreadyAdded])
        .then(([user, alreadyAdded]) => {
            if (!alreadyAdded) {
                userRefs.doc(context.auth.uid).collection('contacts').doc(user.id).set({ userRef: user.id });
                userRefs.doc(user.id).collection('contacts').doc(context.auth.uid).set({ userRef: context.auth.uid });
                return data.email + ' added to contacts';
            }
            return data.email + ' already in contacts';
        })
        .catch();
})
