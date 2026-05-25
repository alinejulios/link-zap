import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const spreadsheetProvider = new GoogleAuthProvider();
spreadsheetProvider.addScope('https://www.googleapis.com/auth/spreadsheets');

const standardProvider = new GoogleAuthProvider();

let isSigningInWithScopes = false;
let cachedAccessToken: string | null = null;

// App-wide Auth State (no extra scopes needed)
export const initAppAuth = (
  onAuthSuccess: (user: User) => void,
  onAuthFailure: () => void
) => {
  return onAuthStateChanged(auth, (user: User | null) => {
    if (user) {
      onAuthSuccess(user);
    } else {
      onAuthFailure();
    }
  });
};

export const standardGoogleSignIn = async (): Promise<User | null> => {
  try {
    const result = await signInWithPopup(auth, standardProvider);
    return result.user;
  } catch (error: any) {
    console.error('Sign in error:', error);
    throw error;
  }
};

// Google Sheets specific Auth State
export const initSheetsAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningInWithScopes) {
        cachedAccessToken = null;
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSheetsSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningInWithScopes = true;
    const result = await signInWithPopup(auth, spreadsheetProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to get access token from Firebase Auth');
    }

    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Sign in error:', error);
    throw error;
  } finally {
    isSigningInWithScopes = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const logout = async () => {
  await auth.signOut();
  cachedAccessToken = null;
};
