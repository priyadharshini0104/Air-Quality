"use client";

import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User, signOut, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { onSnapshot, doc } from 'firebase/firestore';

interface AuthContextType {
    user: any | null;
    loading: boolean;
    logout: () => Promise<void>;
    switchAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    loading: true,
    logout: async () => {},
    switchAccount: async () => {},
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    const [user, setUser] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const saved = sessionStorage.getItem('__MOCK_USER__');
            if (saved) {
                try {
                    const u = JSON.parse(saved);
                    setUser(u);
                    setLoading(false);
                } catch (e) {}
            }
            (window as any).__TRIGGER_AUTH_UPDATE__ = (u: any) => {
                setUser(u);
                setLoading(false);
            };
        }

        let unsubscribeSnapshot: (() => void) | null = null;

        const unsubscribe = onAuthStateChanged(auth, (authUser) => {
            if (typeof window !== 'undefined' && sessionStorage.getItem('__MOCK_USER__')) {
                // If mock user is logged in, do not overwrite with null
                return;
            }
            if (authUser) {
                // When auth user exists, listen to their Firestore document
                unsubscribeSnapshot = onSnapshot(doc(db, 'users', authUser.uid), (docSnap) => {
                    if (!docSnap.exists()) {
                        console.log("User document does not exist yet. Waiting for it to be created.");
                    }
                }, (error) => {
                    console.error("Error listening to user document", error);
                });
            } else {
                // No auth user, unsubscribe from firestore if we were listening
                if (unsubscribeSnapshot) {
                    unsubscribeSnapshot();
                    unsubscribeSnapshot = null;
                }
            }
            setUser(authUser);
            setLoading(false);
        });

        return () => {
            unsubscribe();
            if (unsubscribeSnapshot) {
                unsubscribeSnapshot();
            }
        };
    }, []);

    const logout = async () => {
        try {
            if (typeof window !== 'undefined') {
                sessionStorage.removeItem('__MOCK_USER__');
            }
            await signOut(auth);
            window.location.href = '/login';
        } catch (error) {
            console.error("Error signing out", error);
        }
    };

    const switchAccount = async () => {
        try {
            // Force account selection for Google
            const provider = new GoogleAuthProvider();
            provider.setCustomParameters({ prompt: 'select_account' });
            await signInWithPopup(auth, provider);
            window.location.href = '/profile';
        } catch (error) {
            console.error("Error switching account", error);
        }
    };

    return (
        <AuthContext.Provider value={{ user, loading, logout, switchAccount }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
