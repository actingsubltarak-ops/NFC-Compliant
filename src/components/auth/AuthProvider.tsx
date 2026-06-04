/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  onAuthStateChanged, 
  User, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile
} from 'firebase/auth';
import { doc, getDoc, setDoc, getDocFromServer } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { UserProfile, UserRole } from '../../types';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isSigningIn: boolean; 
  authError: string | null;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, pass: string) => Promise<void>;
  signUpWithEmail: (email: string, pass: string, fullName: string) => Promise<void>;
  logout: () => Promise<void>;
  setAuthError: (err: string | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        setAuthError(null);
        
        // Start profile fetch but don't block the initial auth flow if we can help it
        // However, we need the initial profile info. We'll try to get it quickly.
        let profileFetched = false;
        
        const fetchProfile = async () => {
          try {
            const userDocRef = doc(db, 'users', firebaseUser.uid);
            // Try to get from cache first for extreme speed
            const profileDoc = await getDoc(userDocRef);

            if (profileDoc.exists()) {
              const data = profileDoc.data() as UserProfile;
              setProfile(data);
              
              // Bootstrap logic: if this is the owner and they aren't admin yet, update them in the background
              const BOOTSTRAP_ADMIN = (import.meta as any).env.VITE_BOOTSTRAP_ADMIN_EMAIL || 'actingsublt.arak@gmail.com';
              if (firebaseUser.email === BOOTSTRAP_ADMIN && data.role !== 'admin') {
                console.log("Upgrading bootstrap email to admin...");
                setDoc(userDocRef, { role: 'admin' }, { merge: true }).then(() => {
                  setProfile({ ...data, role: 'admin' });
                });
              }
            } else {
              // Create default profile if not exists
              const BOOTSTRAP_ADMIN = (import.meta as any).env.VITE_BOOTSTRAP_ADMIN_EMAIL || 'actingsublt.arak@gmail.com';
              const isFirstAdmin = firebaseUser.email === BOOTSTRAP_ADMIN;
              const newProfile: UserProfile = {
                uid: firebaseUser.uid,
                fullName: firebaseUser.displayName || 'Anonymous',
                email: firebaseUser.email || '',
                role: isFirstAdmin ? 'admin' : 'citizen',
                createdAt: new Date().toISOString()
              };
              await setDoc(userDocRef, newProfile);
              setProfile(newProfile);
            }
          } catch (error: any) {
             // Fallback profile if fetch fails (e.g. offline)
             const BOOTSTRAP_ADMIN = (import.meta as any).env.VITE_BOOTSTRAP_ADMIN_EMAIL || 'actingsublt.arak@gmail.com';
             setProfile({
               uid: firebaseUser.uid,
               fullName: firebaseUser.displayName || 'User',
               email: firebaseUser.email || '',
               role: firebaseUser.email === BOOTSTRAP_ADMIN ? 'admin' : 'citizen',
               createdAt: new Date().toISOString()
             });
          } finally {
            setLoading(false);
          }
        };

        fetchProfile();
      } else {
        setUser(null);
        setProfile(null);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    if (isSigningIn) return;
    setAuthError(null);
    setIsSigningIn(true);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      if (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') {
        console.log("User cancelled or closed the login popup.");
      } else if (error.code === 'auth/popup-blocked') {
        console.warn("Popup blocked.");
        setAuthError("เบราว์เซอร์บล็อกหน้าต่างป๊อปอัป กรุณาอนุญาตให้แสดงป๊อปอัป (Allow Popups) แล้วลองอีกครั้ง");
      } else {
        console.error("Login failed:", error);
        setAuthError("การเข้าสู่ระบบล้มเหลว กรุณาลองใหม่อีกครั้ง");
        throw error;
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  const signInWithEmail = async (email: string, pass: string) => {
    setAuthError(null);
    try {
      await signInWithEmailAndPassword(auth, email, pass);
    } catch (error: any) {
      setAuthError(error.message || "อีเมลหรือรหัสผ่านไม่ถูกต้อง");
      throw error;
    }
  };

  const signUpWithEmail = async (email: string, pass: string, fullName: string) => {
    setAuthError(null);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
      await updateProfile(userCredential.user, { displayName: fullName });
    } catch (error: any) {
      setAuthError(error.message || "ไม่สามารถลงทะเบียนได้");
      throw error;
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      profile, 
      loading, 
      isSigningIn,
      authError,
      signInWithGoogle, 
      signInWithEmail, 
      signUpWithEmail, 
      logout,
      setAuthError
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
