import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, getReactNativePersistence, initializeAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyCCx8zt6hYJhJIa9P_o0WrymsJ09ccheJI',
  authDomain: 'ichat-91357.firebaseapp.com',
  projectId: 'ichat-91357',
  storageBucket: 'ichat-91357.appspot.com',
  messagingSenderId: '991947773583',
  appId: '1:991947773583:ios:fbe665978eb761b14042fa',
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

let auth;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch (error) {
  // Auth may already have been initialized during Fast Refresh, or persistence
  // may be unavailable in the current Expo runtime. Either case must not stop
  // React Native from mounting the application.
  console.warn('Firebase Auth persistence was unavailable; using default Auth.', error);
  auth = getAuth(app);
}

const firestore = getFirestore(app);

export { app, auth, firestore };
