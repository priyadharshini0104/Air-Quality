'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/AuthContext';

const HEALTH_PROFILES = [
  { id: 'pregnancy', label: '🤰 Pregnant / Expecting Mother', tag: 'High Maternal Sensitivity', aqiThreshold: 45, info: 'Baby & maternal lung barrier care' },
  { id: 'asthma', label: '🫁 Asthma / Chronic Wheezing', tag: 'Severe Respiratory Trigger', aqiThreshold: 50, info: 'SOS inhaler readiness & PM2.5 alarms' },
  { id: 'sinus', label: '🤧 Sinusitis & Dust Allergy', tag: 'Nasal Mucosa Vulnerable', aqiThreshold: 55, info: 'Evening steam & particulate defense' },
  { id: 'skin', label: '🧴 Eczema, Acne & Sensitive Skin', tag: 'Dermal Barrier Damage', aqiThreshold: 50, info: 'Face photo test & ceramide barrier' },
  { id: 'cardio', label: '❤️ Heart Disease / Hypertension', tag: 'Oxygen Flow Strain', aqiThreshold: 50, info: 'Zero heavy outdoor workouts' },
  { id: 'elderly', label: '👵 Senior Citizen / COPD', tag: 'Immune & Lung Guard', aqiThreshold: 45, info: 'Complete indoor air filtered protection' },
  { id: 'general', label: '🌿 None (General Healthy Living)', tag: 'Preventive Wellness', aqiThreshold: 100, info: 'Hydration & clean commute tracking' },
];

export default function RegisterAndSentinel() {
  const { user } = useAuth();

  const [userName, setUserName] = useState('Priyadharshini');
  const [email, setEmail] = useState('priyadharshinidhanasekaran057@gmail.com');
  const [phone, setPhone] = useState('9940969045');
  const [primaryCity, setPrimaryCity] = useState('Attayampatti');
  const [selectedCondition, setSelectedCondition] = useState('pregnancy');

  const [liveAqi, setLiveAqi] = useState<number>(57);
  const [statusMsg, setStatusMsg] = useState<string>('🟢 Automated Sentinel Active — Monitoring environment for your profile...');
  const [lastDispatchedTime, setLastDispatchedTime] = useState<string | null>(null);

  const prevAqiRef = useRef<number | null>(null);

  useEffect(() => {
    if (user?.name) setUserName(user.name);
    if (user?.email) setEmail(user.email);

    const savedCond = localStorage.getItem('respira_user_condition');
    if (savedCond) setSelectedCondition(savedCond);

    const savedCity = localStorage.getItem('respira_user_city');
    if (savedCity) setPrimaryCity(savedCity);

    const savedPhone = localStorage.getItem('respira_user_phone');
    if (savedPhone) setPhone(savedPhone);
  }, [user]);

  const dispatchCareNotification = async (city: string, aqiVal: number, cond: string) => {
    try {
      setStatusMsg(`🌸 Preparing personalized health guidance for ${userName} (${cond})...`);

      const cleanPhone = phone.startsWith('+') ? phone : `+91${phone.replace(/^0+/, '')}`;

      const res = await fetch('/api/send-alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userName,
          email,
          phone: cleanPhone,
          location: city,
          condition: cond,
        }),
      });

      const data = await res.json();
      if (data.success) {
        const timeNow = new Date().toLocaleTimeString();
        setLastDispatchedTime(timeNow);
        setStatusMsg(`✅ Sent dedicated ${cond} care bulletin to Email & SMS at ${timeNow}!`);
      }
    } catch (e: any) {
      console.error('Dispatch error:', e);
    }
  };

  // Background Live Satellite AQI Polling
  useEffect(() => {
    const fetchRealAir = async () => {
      try {
        const geoRes = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(primaryCity)}&count=1&language=en&format=json`
        );
        const geo = await geoRes.json();
        if (geo.results && geo.results.length > 0) {
          const { latitude, longitude, name } = geo.results[0];

          const airRes = await fetch(
            `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${latitude}&longitude=${longitude}&current=us_aqi`
          );
          const airData = await airRes.json();

          if (airData.current) {
            const currentAqi = Math.round(airData.current.us_aqi || 57);
            setLiveAqi(currentAqi);

            const activeProfile = HEALTH_PROFILES.find((p) => p.id === selectedCondition) || HEALTH_PROFILES[0];

            if (currentAqi >= activeProfile.aqiThreshold && prevAqiRef.current !== currentAqi) {
              prevAqiRef.current = currentAqi;
              dispatchCareNotification(name, currentAqi, selectedCondition);
            } else {
              setStatusMsg(`🟢 Sentinel observing ${name}: AQI ${currentAqi}. Watching your ${selectedCondition} safety.`);
            }
          }
        }
      } catch (err) {
        console.error('Air poll error:', err);
      }
    };

    fetchRealAir();
    const interval = setInterval(fetchRealAir, 30000);
    return () => clearInterval(interval);
  }, [primaryCity, selectedCondition, email, phone]);

  const handleRegisterSave = () => {
    localStorage.setItem('respira_user_condition', selectedCondition);
    localStorage.setItem('respira_user_city', primaryCity);
    localStorage.setItem('respira_user_phone', phone);
    prevAqiRef.current = null;
    dispatchCareNotification(primaryCity, liveAqi, selectedCondition);
  };

  return (
    <div style={{ minHeight: '100vh', width: '100%', background: '#070d19', color: '#f8fafc', padding: '35px 24px' }}>
      <div style={{ maxWidth: '1240px', margin: '0 auto', width: '100%' }}>
        
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px', flexWrap: 'wrap', gap: '14px' }}>
          <div>
            <h1 style={{ fontSize: '30px', fontWeight: 800, color: '#2dd4bf', margin: 0 }}>
              Respira <span style={{ color: '#38bdf8' }}>Flare</span> Patient &amp; Maternal Sentinel
            </h1>
            <p style={{ color: '#94a3b8', fontSize: '14px', margin: '4px 0 0' }}>
              Personalized air exposure alerts mapped directly to your medical vulnerability
            </p>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <span style={{ background: '#134e4a', color: '#2dd4bf', padding: '10px 18px', borderRadius: '12px', fontSize: '14px', fontWeight: 600 }}>
              📍 {primaryCity}
            </span>
            <span style={{ background: liveAqi > 50 ? '#854d0e' : '#064e3b', color: liveAqi > 50 ? '#fef08a' : '#6ee7b7', padding: '10px 18px', borderRadius: '12px', fontSize: '14px', fontWeight: 700 }}>
              AQI: {liveAqi}
            </span>
          </div>
        </div>

        {/* Live Sentinel Tracker */}
        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '14px', padding: '14px 20px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ fontSize: '14px', color: '#38bdf8', fontWeight: 500 }}>{statusMsg}</div>
          {lastDispatchedTime && (
            <div style={{ fontSize: '13px', color: '#94a3b8' }}>
              Last Dispatch: <b style={{ color: '#2dd4bf' }}>{lastDispatchedTime}</b>
            </div>
          )}
        </div>

        {/* Two-Column Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '24px' }}>
          
          {/* Form Card */}
          <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '18px', padding: '24px' }}>
            <h2 style={{ fontSize: '18px', color: '#f1f5f9', marginTop: 0, marginBottom: '16px' }}>
              📝 Patient &amp; User Registration
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Full Name</label>
                <input
                  type="text"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  style={{ width: '100%', padding: '11px', borderRadius: '10px', background: '#1e293b', border: '1px solid #334155', color: '#fff', fontSize: '14px' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Monitored City / Zone</label>
                <input
                  type="text"
                  value={primaryCity}
                  onChange={(e) => setPrimaryCity(e.target.value)}
                  style={{ width: '100%', padding: '11px', borderRadius: '10px', background: '#1e293b', border: '1px solid #334155', color: '#fff', fontSize: '14px' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Email ID for Health Bulletins</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={{ width: '100%', padding: '11px', borderRadius: '10px', background: '#1e293b', border: '1px solid #334155', color: '#fff', fontSize: '14px' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Mobile Number for Direct SMS</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  style={{ width: '100%', padding: '11px', borderRadius: '10px', background: '#1e293b', border: '1px solid #334155', color: '#fff', fontSize: '14px' }}
                />
              </div>

              <button
                onClick={handleRegisterSave}
                style={{ marginTop: '10px', padding: '14px', borderRadius: '10px', background: 'linear-gradient(135deg, #14b8a6, #06b6d4)', color: '#020617', border: 'none', fontWeight: 700, cursor: 'pointer', fontSize: '14px' }}
              >
                💾 Save Profile &amp; Dispatch Empathetic Health Alert
              </button>
            </div>
          </div>

          {/* Condition Selector Card */}
          <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '18px', padding: '24px' }}>
            <h2 style={{ fontSize: '18px', color: '#f1f5f9', marginTop: 0, marginBottom: '6px' }}>
              🩺 Select Primary Health Vulnerability
            </h2>
            <p style={{ color: '#94a3b8', fontSize: '13px', margin: '0 0 16px' }}>
              Alerts and recommendations will explicitly address your chosen condition:
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {HEALTH_PROFILES.map((p) => (
                <div
                  key={p.id}
                  onClick={() => setSelectedCondition(p.id)}
                  style={{
                    padding: '12px 16px',
                    borderRadius: '12px',
                    background: selectedCondition === p.id ? '#134e4a30' : '#1e293b',
                    border: selectedCondition === p.id ? '1px solid #2dd4bf' : '1px solid #334155',
                    cursor: 'pointer',
                    transition: '0.2s ease',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <b style={{ color: selectedCondition === p.id ? '#2dd4bf' : '#f1f5f9', fontSize: '14px' }}>{p.label}</b>
                    <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '6px', background: '#070d19', color: '#38bdf8' }}>
                      {p.tag}
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
                    Threshold: AQI {p.aqiThreshold} • {p.info}
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}