import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCCx8zt6hYJhJIa9P_o0WrymsJ09ccheJI",
  authDomain: "ichat-91357.firebaseapp.com",
  projectId: "ichat-91357",
  storageBucket: "ichat-91357.appspot.com",
  messagingSenderId: "991947773583",
  appId: "1:991947773583:ios:fbe665978eb761b14042fa"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const firestore = getFirestore(app);

export { app, auth, firestore };
