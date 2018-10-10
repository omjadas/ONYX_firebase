const functions = require('firebase-functions');
const admin = require('firebase-admin');
const geolib = require('geolib');
admin.initializeApp();


// Function exports
exports.requestCarer = functions.https.onCall(requestCarer);
exports.sendSOS = functions.https.onCall(sendSOS);
exports.sendAnnotation = functions.https.onCall(sendAnnotation);
exports.acceptCarerRequest = functions.https.onCall(acceptCarerRequest);
exports.disconnect = functions.https.onCall(disconnect);
exports.chatNotification = functions.firestore
    .document('chat_rooms/{chatId}/message/{messageId}')
    .onCreate(chatNotification);
exports.addContact = functions.https.onCall(addContact);

/**
 * Requests a carer.
 * 
 * Sends a Firebase Cloud Message of type 'carerRequest' to carers within a 500m
 * radius of the user, using {@link sendFCMMessage}. 
 * 
 * @param {Object} data Data passed to the cloud function.
 * @param {functions.https.CallableContext} context User auth information.
 * 
 * @returns {Promise} Promise object that represents either 'Waiting for carer
 *     response' (if carers were found )or 'No carers found' (if no carers were
 *     found).
 */
function requestCarer(data, context) {
    return sendFCMMessage(500, 'carerRequest', 'Waiting for carer', 'No carers found', data, context);
}

/**
 * Sends an SOS to nearby carers.
 * 
 * Sends a Firebase Cloud Message of type 'SOS' to carers within a 1000m of the
 * user, using {@link sendFCMMessage}. 
 * 
 * @param {Object} data Data passed to the cloud function.
 * @param {functions.https.CallableContext} context User auth information.
 * 
 * @returns {Promise} Promise object that represents either 'Help is on the way'
 *     (if the SOS was successfully sent) or 'No carers found' (if there was no
 *     one to send the SOS to nearby).
 */
function sendSOS(data, context) {
    return sendFCMMessage(1000, 'SOS', 'Help is on the way', 'No carers found', data, context);
}

/**
 * Sends an annotation to the connected user.
 * 
 * Sends a Firebase Cloud Message of type 'annotation' that contains the points
 * necessary to reproduce the annotations on the receiver's device.
 * 
 * @param {Object} data Data passed to the cloud function.
 * @param {string} data.points The points that are necessary to reconstruct the
 *     annotation on the receiver's device.
 * @param {functions.https.CallableContext} context User auth information.
 * 
 * @returns {Promise} Promise object that represents either 'Annotations
 *     successfully sent' (if the annotations were sent) or 'Annotations failed
 *     to send' (if the annotations were not sent).
 */
function sendAnnotation(data, context) {
    var db = admin.firestore();

    return db.collection('users').doc(context.auth.uid).get()
        .then(user => {
            if (!user.exists) {
                console.log('User not Found!');
                return null;
            } else {
                console.log('User Found');
                return user;
            }
        })
        .catch(err => {
            console.log('Error getting document', err);
        })
        .then(user => {
            return db.collection('users').doc(user.get('connectedUser')).get();
        })
        .then(connectedUser => {
            if (!connectedUser.exists) {
                console.log('connectedUser not Found!');
                return null;
            } else {
                console.log('connectedUser Found');
                return connectedUser;
            }
        })
        .catch(err => {
            console.log('Error getting document', err);
        })
        .then(connectedUser => {
            var fcm = {
                data: {
                    type: 'annotation',
                    points: data.points
                },
                token: connectedUser.get('firebaseToken')
            }
            return admin.messaging().send(fcm);
        })
        .then(response => {
            // Response is a message ID string.
            console.log('Successfully sent message:', response);
            return 'Annotations successfully sent';
        })
        .catch(error => {
            console.log('Error sending message:', error);
            return 'Annotations failed to send';
        });
}

/**
 * Sends an FCM message to carers within a certain radius.
 * 
 * Sends a Firebase Cloud Message to carers within a certain radius of the user.
 * 
 * @param {number} radius The radius (in metres) within which carers are found.
 * @param {string} type The type of the FCM message.
 * @param {string} returnSuccess The value the function should return on success.
 * @param {string} returnFailure The value the function should return on failure.
 * @param {Object} data Data passed to the cloud function.
 * @param {functions.https.CallableContext} context User auth information.
 * 
 * @returns {Promise} Promise object that represents either returnSuccess or
 *      returnFailure depending on whether or not the message was sent.
 */
function sendFCMMessage(radius, type, returnSuccess, returnFailure, data, context) {
    var db = admin.firestore();
    var user = db.collection('users').doc(context.auth.uid).get()
        .then(user => {
            if (!user.exists) {
                console.log('User not Found!');
                return null;
            } else {
                console.log('User Found');
                return user;
            }
        })
        .catch(err => {
            console.log('Error getting document', err);
        });

    var carers = user
        .then(user => {
            var currentLocation = geoPointToGeolib(user.data().currentLocation);
            var small = geolib.computeDestinationPoint(currentLocation, radius, 180);
            var large = geolib.computeDestinationPoint(currentLocation, radius, 0);
            return db.collection('users')
                .where('isCarer', '==', true)
                .where('isOnline', '==', true)
                .where('currentLocation', '>=', new admin.firestore.GeoPoint(small.latitude, small.longitude))
                .where('currentLocation', '<=', new admin.firestore.GeoPoint(large.latitude, large.longitude)).get();
        });

    return Promise.all([user, carers])
        .then(([user, carers]) => {
            var returnValue = null;
            if (carers.size) {
                carers.forEach(carer => {
                    if (geolib.getDistance(geoPointToGeolib(user.get('currentLocation')), geoPointToGeolib(carer.get('currentLocation'))) < radius) {
                        var message = {
                            data: {
                                type: type,
                                senderId: user.id,
                                senderName: user.get('firstName'),
                                senderLatitude: user.get('currentLocation').latitude.toString(),
                                senderLongitude: user.get('currentLocation').longitude.toString(),
                            },
                            token: carer.get('firebaseToken')
                        };
                        admin.messaging().send(message);
                        returnValue = returnSuccess
                    } else {
                        if (returnValue !== returnSuccess) {
                            returnValue = returnFailure;
                        }
                    }
                });
                return returnValue;
            }
            return returnFailure;
        });
}

/**
 * Converts GeoPoint to simple object. 
 * 
 * Converts a FireBase GeoPoint object to an object that is compatible with
 * geolib.
 * 
 * @param {admin.firestore.GeoPoint} geopoint Firebase GeoPoint object.
 * 
 * @return {Object.<string, number>} Geolib compatible object containing
 *     latitude and longitude.
 */
function geoPointToGeolib(geopoint) {
    return {
        latitude: geopoint.latitude,
        longitude: geopoint.longitude
    }
}

/**
 * Accepts a carer request.
 * 
 * Accepts a carer request by setting both the carer and the assisted person's
 * connectedUser Cloud Fire fields to the other's ID.
 * 
 * @param {Object} data Data passed to the cloud function.
 * @param {string} data.receiver The ID of the user who sent the initial carer
 *     request.
 * @param {functions.https.CallableContext} context User auth information.
 * 
 * @returns {Promise} Promise object that represents either 'Connected' (if the
 *     two users were successfully connected) or 'You snooze, you loose!' (if
 *     the user who requested a carer was already connected with someone else).
 */
function acceptCarerRequest(data, context) {
    var db = admin.firestore();

    var receiver = db.collection('users').doc(data.receiver).get()
        .then(receiver => {
            if (!receiver.exists) {
                console.log('User not Found!');
                return null;
            } else {
                console.log('User Found');
                return receiver;
            }
        })
        .catch(err => {
            console.log('Error getting document', err);
        });

    return receiver
        .then(receiver => {
            if (!receiver.get('connectedUser')) {
                var fcm = {
                    data: {
                        type: 'accept',
                        uid: context.auth.uid
                    },
                    token: receiver.get('firebaseToken')
                }
                db.collection('users').doc(data.receiver).update({ connectedUser: context.auth.uid });
                db.collection('users').doc(context.auth.uid).update({ connectedUser: data.receiver });
                admin.messaging().send(fcm);
                return 'Connected';
            }
            return 'You snooze, you loose!';
        })
        .catch();
}

/**
 * Disconnects two users.
 * 
 * Sets the connectedUser field in each user's Cloud Firestore to null.
 * 
 * @param {Object} data Data passed to the cloud function.
 * @param {functions.https.CallableContext} context User auth information.
 * 
 * @returns {Promise} Promise that represents either 'Disconnected' (if the two
 *     users were disconnected successfully) or 'User not connected' (if the
 *     calling user was not connected to start with). 
 */
function disconnect(data, context) {
    var db = admin.firestore()

    var user = db.collection('users').doc(context.auth.uid).get()
        .then(user => {
            if (!user.exists) {
                console.log('User not Found!');
                return null;
            } else {
                console.log('User Found');
                return user;
            }
        })
        .catch(err => {
            console.log('Error getting document', err);
        });

    var connectedUser = db.collection('users').doc(user.get('connectedUser')).get()
        .then(connectedUser => {
            if (!connectedUser.exists) {
                console.log('Connected User not Found!');
                return null;
            } else {
                console.log('Connected User Found');
                return connectedUser;
            }
        })
        .catch(err => {
            console.log('Error getting document', err);
        });

    return Promise.all([user, connectedUser])
        .then(([user, connectedUser]) => {
            if (user.get('connectedUser') !== null) {
                db.collection('users').doc(user.get('connectedUser')).update({ connectedUser: null });
                db.collection('users').doc(context.auth.uid).update({ connectedUser: null });
                var fcm = {
                    data: {
                        type: 'disconnect',
                        name: user.get('firstName') + ' ' + user.get('lastName')
                    },
                    token: connectedUser.get('firebaseToken')
                }
                return admin.messaging.send(fcm);
            }
            return 'User not connected'
        })
        .then(response => {
            if (response === 'User not connected') {
                return response;
            }
            // Response is a message ID string.
            console.log('Successfully sent message:', response);
            return 'Disconnected';
        })
        .catch(error => {
            console.log('Error sending message:', error);
            return 'Unable to Disconnect';
        });
}

/**
 * Sends a notification if a user is sent a chat message.
 * 
 * Sends a Firebase Cloud Message to the receiver of a chat message when a new
 * entry is created in the chat_rooms collection.
 * 
 * @param {Object} snap Cloud Firestore document snapshot.
 * @param {functions.EventContext} context The context in which the event
 *     occurred.
 * 
 * @returns {Promise} Promise object that represents either 'Notification sent'
 *     (if the FCM message was successfully sent) or 'Notification not sent' (if
 *     sending the FCM message failed).
 */
function chatNotification(snap, context) {
    const message = snap.data();
    var db = admin.firestore();

    return db.collection('users').doc(message.receiverUid).get()
        .then(receiver => {
            if (!receiver.exists) {
                console.log('User not Found');
                return null;
            } else {
                console.log('User Found');
                return receiver;
            }
        })
        .catch(err => {
            console.log('Error getting document', err);
        })
        .then(receiver => {
            var fcm = {
                data: {
                    type: 'chat',
                    title: message.sender,
                    text: message.message,
                    username: message.sender,
                    uid: message.senderUid
                },
                token: receiver.get('firebaseToken')
            }
            return admin.messaging().send(fcm);
        })
        .then(response => {
            // Response is a message ID string.
            console.log('Successfully sent message:', response);
            return 'Notification sent';
        })
        .catch(error => {
            console.log('Error sending message:', error);
            return 'Notification not sent';
        });
}

/**
 * Adds a user as a contact.
 * 
 * Adds two user's to each other's contacts collection.
 * 
 * @param {Object} data Data passed to the cloud function.
 * @param {string} data.email The email address of the user to be added as a
 *     contact.
 * @param {functions.https.CallableContext} context User auth information.
 * 
 * @returns {Promise} Promise object that represents either '{data.email} added
 *     to contacts' (if the users were added to each other's contacts) or
 *     '{data.email} already in contacts' (if the users werw already in each
 *     other's contacts).
 */
function addContact(data, context) {
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

    var alreadyAdded = user
        .then(user => {
            return db.collection('users').doc(context.auth.uid).collection('contacts').doc(user.id).get()
        })
        .then((docSnapshot) => {
            if (docSnapshot.exists) {
                return true;
            }
            return false;
        });

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
}
