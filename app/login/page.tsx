"use client";

import { useState } from 'react';
import { Mail, Lock, User, ArrowRight, Eye, EyeOff, ShieldCheck, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';
import { auth, db } from '@/lib/firebase';
import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    updateProfile,
    GoogleAuthProvider,
    signInWithPopup,
    sendEmailVerification,
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { createOrUpdateUser } from '@/lib/userService';
import Logo from '@/components/Logo';

export default function LoginPage() {
    const [isLogin, setIsLogin] = useState(true);
    const [isLoading, setIsLoading] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [fullName, setFullName] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    // Email verification state
    const [needsVerification, setNeedsVerification] = useState(false);
    const [resendCooldown, setResendCooldown] = useState(0);

    const router = useRouter();

    // ─── Client-side quick format check ────────────────────────────
    const quickFormatCheck = (emailStr: string) => {
        return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(emailStr);
    };

    // ─── Server-side deep email validation ─────────────────────────
    const validateEmailDeep = async (emailStr: string): Promise<{ valid: boolean; reason: string }> => {
        try {
            const res = await fetch('/api/validate-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: emailStr }),
            });
            const data = await res.json();
            return {
                valid: data.status === 'VALID',
                reason: data.reason || 'Invalid email',
            };
        } catch {
            // If validation API fails, fall back to format check only
            return { valid: quickFormatCheck(emailStr), reason: 'Invalid email format' };
        }
    };

    // ─── Resend verification email ─────────────────────────────────
    const resendVerification = async () => {
        if (resendCooldown > 0) return;
        try {
            // Sign in silently to get the user object, then send verification
            const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
            
            const actionCodeSettings = {
                url: window.location.origin + '/login',
                handleCodeInApp: true,
            };
            await sendEmailVerification(cred.user, actionCodeSettings);
            
            setSuccess('✉️ Verification email sent! PLEASE CHECK YOUR SPAM/JUNK FOLDER.');
            setError('');
            // 60-second cooldown
            setResendCooldown(60);
            const interval = setInterval(() => {
                setResendCooldown(c => {
                    if (c <= 1) { clearInterval(interval); return 0; }
                    return c - 1;
                });
            }, 1000);
        } catch (err: any) {
            console.error("Resend error:", err);
            if (err.code === 'auth/too-many-requests') {
                setError('Too many emails sent. Please wait a few minutes.');
            } else {
                setError('Failed to resend verification email. Check your password and try again.');
            }
        }
    };

    // ─── Main form submit ──────────────────────────────────────────
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');
        setSuccess('');
        setNeedsVerification(false);

        const trimmedEmail = email.trim().toLowerCase();

        if (!trimmedEmail || !password || (!isLogin && !fullName)) {
            setError(!isLogin && !fullName ? 'Please fill in all fields (including name).' : 'Please fill in both email and password fields.');
            setIsLoading(false);
            return;
        }

        // Quick format check
        if (!quickFormatCheck(trimmedEmail)) {
            setError('Invalid email format. Use format: user@example.com');
            setIsLoading(false);
            return;
        }

        try {
            if (isLogin) {
                // ── LOGIN FLOW ─────────────────────────────────────
                const loginCredential = await signInWithEmailAndPassword(auth, trimmedEmail, password);

                // Check email verification status
                if (!loginCredential.user.emailVerified) {
                    setNeedsVerification(true);
                    setError('Please verify your email before logging in. Check your inbox for the verification link.');
                    // Sign out — don't allow access
                    await auth.signOut();
                    setIsLoading(false);
                    return;
                }

                // Verified — proceed
                await createOrUpdateUser(loginCredential.user.uid, {
                    name: loginCredential.user.displayName || '',
                    email_or_phone: trimmedEmail,
                    login_method: 'email',
                });
                setSuccess('Login successful! Redirecting...');
                setTimeout(() => router.push('/'), 800);

            } else {
                // ── SIGNUP FLOW ────────────────────────────────────

                // Step 1: Deep server-side email validation
                const validation = await validateEmailDeep(trimmedEmail);
                if (!validation.valid) {
                    setError(validation.reason);
                    setIsLoading(false);
                    return;
                }

                // Step 2: Password strength check
                if (password.length < 6) {
                    setError('Password must be at least 6 characters.');
                    setIsLoading(false);
                    return;
                }

                // Step 3: Create account
                const userCredential = await createUserWithEmailAndPassword(auth, trimmedEmail, password);

                if (fullName) {
                    await updateProfile(userCredential.user, { displayName: fullName });
                }

                // Step 4: Send verification email
                try {
                    const actionCodeSettings = {
                        url: window.location.origin + '/login',
                        handleCodeInApp: true,
                    };
                    await sendEmailVerification(userCredential.user, actionCodeSettings);
                } catch (emailErr: any) {
                    console.error("Email send failed:", emailErr);
                    // It likely failed due to Firebase free tier quota or blocked IP
                    // We will still create the account, but warn the user
                    setNeedsVerification(true);
                    setError('Account created, but we hit a server limit sending the verification email. Please try clicking "Resend" below in a few minutes.');
                    
                    // Step 5: Save user data to Firestore
                    await createOrUpdateUser(userCredential.user.uid, {
                        name: fullName || '',
                        email_or_phone: trimmedEmail,
                        login_method: 'email',
                    });
                    
                    await auth.signOut();
                    setIsLoading(false);
                    return;
                }

                // Step 5: Save user data to Firestore
                await createOrUpdateUser(userCredential.user.uid, {
                    name: fullName || '',
                    email_or_phone: trimmedEmail,
                    login_method: 'email',
                });
                await setDoc(doc(db, 'users', userCredential.user.uid), {
                    email: trimmedEmail,
                    displayName: fullName || '',
                    emailVerified: false,
                }, { merge: true });

                // Step 6: Sign out — require verification before first login
                await auth.signOut();

                setNeedsVerification(true);
                setSuccess('✅ Account created! Please check your inbox (AND SPAM FOLDER) for the verification link.');
            }
        } catch (err: any) {
            console.error("Auth error:", err.code, err.message);
            if (err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
                setError('Invalid email or password.');
            } else if (err.code === 'auth/email-already-in-use') {
                setError('This email is already registered. Please login instead.');
            } else if (err.code === 'auth/weak-password') {
                setError('Password is too weak. Use at least 6 characters.');
            } else if (err.code === 'auth/too-many-requests') {
                setError('Too many attempts. Please wait a few minutes and try again.');
            } else {
                setError(err.message || 'An error occurred.');
            }
        } finally {
            setIsLoading(false);
        }
    };

    // ─── Google sign-in (always verified by Google) ────────────────
    const handleGoogleSignIn = async () => {
        setIsLoading(true);
        setError('');
        setNeedsVerification(false);

        // Bypass for automated recording/testing or in development if popup fails
        if (process.env.NODE_ENV === 'development') {
            const mockUser = {
                uid: 'mock-user-123',
                displayName: 'Respira Guardian',
                email: 'guardian@respiraflare.com',
                emailVerified: true,
                photoURL: 'https://ui-avatars.com/api/?name=Respira+Guardian&background=2dd4bf&color=fff&size=128',
                metadata: { creationTime: new Date().toISOString() }
            };
            sessionStorage.setItem('__MOCK_USER__', JSON.stringify(mockUser));
            if ((window as any).__TRIGGER_AUTH_UPDATE__) {
                (window as any).__TRIGGER_AUTH_UPDATE__(mockUser);
            }
            router.push('/profile');
            return;
        }

        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        try {
            const result = await signInWithPopup(auth, provider);
            await createOrUpdateUser(result.user.uid, {
                name: result.user.displayName || '',
                email_or_phone: result.user.email || '',
                login_method: 'google',
            });
            await setDoc(doc(db, 'users', result.user.uid), {
                fullName: result.user.displayName || '',
                email: result.user.email || '',
                emailVerified: true, // Google accounts are always verified
            }, { merge: true });
            router.push('/');
        } catch (err: any) {
            if (err.code !== 'auth/popup-closed-by-user') {
                setError(err.message || 'Google sign-in failed.');
            }
            setIsLoading(false);
        }
    };

    return (
        <div className={styles.container}>
            <div className={styles.bg}>
                <div className={styles.orb1} /><div className={styles.orb2} /><div className={styles.orb3} /><div className={styles.gridLines} />
            </div>

            <div className={styles.authCard}>
                <div className={styles.brand}>
                    <Logo width={70} />
                    <span className={styles.brandName}>Respira Flare</span>
                </div>

                <div className={styles.header}>
                    <h1 className={styles.title}>{isLogin ? 'Welcome Back' : 'Get Started'}</h1>
                    <p className={styles.subtitle}>
                        {isLogin ? 'Sign in to access your dashboard' : 'Create your account and start breathing smarter'}
                    </p>
                </div>

                {error && <div className={styles.alertError}><span>⚠</span> {error}</div>}
                {success && <div className={styles.alertSuccess}><span>✓</span> {success}</div>}

                {/* Verification needed banner */}
                {needsVerification && (
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '10px',
                        padding: '14px 16px', marginBottom: '16px',
                        background: 'rgba(99,102,241,0.08)',
                        border: '1px solid rgba(99,102,241,0.3)',
                        borderRadius: '12px',
                    }}>
                        <ShieldCheck size={20} color="#818cf8" style={{ flexShrink: 0 }} />
                        <div style={{ flex: 1, fontSize: '13px', color: 'rgba(255,255,255,0.75)', lineHeight: 1.5 }}>
                            <strong style={{ color: '#818cf8' }}>Email verification required.</strong><br />
                            Check your inbox and click the verification link, then come back and log in.
                        </div>
                        <button
                            onClick={resendVerification}
                            disabled={resendCooldown > 0 || !password}
                            style={{
                                flexShrink: 0, padding: '8px 14px',
                                background: resendCooldown > 0 ? 'rgba(99,102,241,0.1)' : 'rgba(99,102,241,0.2)',
                                border: '1px solid rgba(99,102,241,0.4)',
                                borderRadius: '8px', color: '#818cf8',
                                fontSize: '12px', fontWeight: 700, cursor: resendCooldown > 0 ? 'default' : 'pointer',
                                display: 'flex', alignItems: 'center', gap: '6px',
                                opacity: resendCooldown > 0 ? 0.5 : 1,
                            }}
                        >
                            <RefreshCw size={14} />
                            {resendCooldown > 0 ? `${resendCooldown}s` : 'Resend'}
                        </button>
                    </div>
                )}

                <button className={styles.googleBtn} onClick={handleGoogleSignIn} disabled={isLoading} type="button">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                    </svg>
                    <span>Continue with Google</span>
                </button>

                <div className={styles.divider}><span>or continue with email</span></div>

                <form className={styles.form} onSubmit={handleSubmit} noValidate>
                    {!isLogin && (
                        <div className={styles.inputGroup}>
                            <label className={styles.label}>Full Name</label>
                            <div className={styles.inputWrapper}>
                                <User size={17} className={styles.inputIcon} />
                                <input type="text" placeholder="John Doe" value={fullName} onChange={e => setFullName(e.target.value)} />
                            </div>
                        </div>
                    )}

                    <div className={styles.inputGroup}>
                        <label className={styles.label}>Email Address</label>
                        <div className={styles.inputWrapper}>
                            <Mail size={17} className={styles.inputIcon} />
                            <input type="email" placeholder="name@example.com" required value={email} onChange={e => setEmail(e.target.value)} />
                        </div>
                    </div>

                    <div className={styles.inputGroup}>
                        <label className={styles.label}>Password</label>
                        <div className={styles.inputWrapper}>
                            <Lock size={17} className={styles.inputIcon} />
                            <input type={showPassword ? 'text' : 'password'} placeholder="••••••••" required value={password} onChange={e => setPassword(e.target.value)} />
                            <button type="button" className={styles.eyeBtn} onClick={() => setShowPassword(p => !p)}>
                                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                    </div>

                    <button type="submit" className={styles.submitBtn} disabled={isLoading}>
                        {isLoading ? <span className={styles.spinner} /> : <>{isLogin ? 'Sign In' : 'Create Account'}<ArrowRight size={18} /></>}
                    </button>
                </form>

                <div className={styles.footer}>
                    <p>
                        {isLogin ? "Don't have an account?" : 'Already have an account?'}
                        {' '}
                        <button type="button" className={styles.toggleBtn} onClick={() => { setIsLogin(!isLogin); setError(''); setSuccess(''); setNeedsVerification(false); }}>
                            {isLogin ? 'Sign up free' : 'Sign in'}
                        </button>
                    </p>
                </div>
            </div>
        </div>
    );
}
