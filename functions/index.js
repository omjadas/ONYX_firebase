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