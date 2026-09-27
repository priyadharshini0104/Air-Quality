import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioClient = accountSid && authToken ? twilio(accountSid, authToken) : null;

async function getCoordinates(city: string) {
  try {
    const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`);
    const data = await res.json();
    if (data.results && data.results.length > 0) {
      return { name: data.results[0].name, lat: data.results[0].latitude, lon: data.results[0].longitude };
    }
  } catch (e) {
    console.error('Geo error', e);
  }
  return { name: city || 'Attayampatti', lat: 11.5369, lon: 78.0838 };
}

async function getLiveAirQuality(lat: number, lon: number) {
  try {
    const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi,pm2_5`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.current) {
      return { aqi: Math.round(data.current.us_aqi || 57), pm25: data.current.pm2_5 || 18.2 };
    }
  } catch (e) {
    console.error('Air fetch error', e);
  }
  return { aqi: 57, pm25: 18.2 };
}

export async function POST(req: Request) {
  try {
    const { email, phone, location = 'Attayampatti', condition = 'pregnancy', userName = 'Priyadharshini' } = await req.json();

    const geo = await getCoordinates(location);
    const air = await getLiveAirQuality(geo.lat, geo.lon);
    const aqi = air.aqi;

    const cond = (condition || 'pregnancy').toLowerCase();

    // 1. SHORT MESSAGE (Directly for Phone SMS)
    let shortAlertNote = '';
    let detailedConditionTitle = '';
    let profileContext = '';
    let detailedConditionAdvice = '';

    if (cond === 'pregnancy' || cond === 'pregnant') {
      shortAlertNote = 'Maternal alert: Wear comfortable mask outdoors to protect baby & avoid fatigue.';
      detailedConditionTitle = '🤰 Maternal & Fetal Health Guardian';
      profileContext = 'You have registered as an Expecting Mother / Pregnant Woman in your health profile.';
      detailedConditionAdvice = `Dearest ${userName}, protecting your breath directly protects your unborn little one. In ${geo.name}, current live AQI is ${aqi}. Particulates cross placental oxygen pathways, causing dizziness and maternal fatigue. Please wear a soft certified mask outdoors, stay inside gentle room temperatures, and rest well today!`;
    } else if (cond === 'asthma') {
      shortAlertNote = 'Asthma alert: Keep rescue inhaler handy in pocket & avoid cold breeze.';
      detailedConditionTitle = '🫁 Compassionate Respiratory Guardian';
      profileContext = 'You have registered with Asthma & Wheezing Respiratory Care in your health profile.';
      detailedConditionAdvice = `Dear ${userName}, sudden airway tightness is triggered by particulate soot in ${geo.name} (AQI: ${aqi}). Please keep your rescue inhaler handy in your pocket right now, take warm herbal water sips, and avoid cold morning breeze without an N95 mask.`;
    } else if (cond === 'sinus') {
      shortAlertNote = 'Sinus alert: Micro-dust high. Keep windows shut & take steam tonight.';
      detailedConditionTitle = '🤧 Sinus & Airway Comfort Support';
      profileContext = 'You have registered with Chronic Sinusitis & Dust Allergies in your health profile.';
      detailedConditionAdvice = `Hello ${userName}, airborne micro-dust in ${geo.name} (AQI: ${aqi}) inflames nasal passages and causes sinus headaches. Please latch windows shut during traffic rush hours, and take a 10-minute eucalyptus steam inhalation tonight.`;
    } else if (cond === 'skin' || cond === 'eczema' || cond === 'acne') {
      shortAlertNote = 'Skin alert: Soot damages dermal barrier. Double cleanse & check skin portal.';
      detailedConditionTitle = '🧴 Dermal Barrier & Pore Preservation Care';
      profileContext = 'You have registered with Sensitive Skin, Eczema, or Barrier Damage.';
      detailedConditionAdvice = `Hi ${userName}, acidic ambient air in ${geo.name} strips your lipid moisture barrier and clogs pores with micro-soot. We strongly advise taking a facial photo to check skin redness on our portal today. Double cleanse gently tonight and lock in hydration with a ceramide moisturizer.`;
    } else {
      shortAlertNote = 'Health alert: Elevated AQI. Stay well-hydrated & wear a mask outside.';
      detailedConditionTitle = '🌿 Everyday Environmental Health Companion';
      profileContext = 'You have registered under General Environmental Care.';
      detailedConditionAdvice = `Hi ${userName}, the air in ${geo.name} is currently at AQI ${aqi}. Drink plenty of fluids, wear a mask in traffic corridors, and keep indoor spaces ventilated.`;
    }

    const websiteBase = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    const skincareUrl = `${websiteBase}/profile`;

    // 📱 SHORT SMS BODY (Single segment, deliverable to Indian SIM)
    const customSmsBody = `Respira Flare: Hi ${userName}, ${geo.name} AQI is ${aqi}. ${shortAlertNote} Full report sent to your email! Link: ${skincareUrl}`;

    const targetPhone = phone || process.env.ALERT_PHONE_NUMBER || '+919940969045';
    const cleanPhone = targetPhone.startsWith('+') ? targetPhone : `+91${targetPhone.replace(/^0+/, '')}`;

    let smsSuccess = false;
    let smsSid = '';

    if (twilioClient && process.env.TWILIO_PHONE_NUMBER) {
      try {
        const msg = await twilioClient.messages.create({
          body: customSmsBody,
          from: process.env.TWILIO_PHONE_NUMBER,
          to: cleanPhone,
        });
        smsSuccess = true;
        smsSid = msg.sid;
        console.log('[Custom Short SMS Sent]:', msg.sid);
      } catch (err: any) {
        console.error('[SMS Error]:', err.message);
      }
    }

    // 📧 FULL RICH EMAIL BODY (Detailed touching advice, plants, hydration, and links)
    const cropAdvice = `🌿 Eco-Flora Recommendation: Tulsi, Neem, or Snake Plants actively capture toxic particulate soot around your home in ${geo.name}.`;
    const hydrationAdvice = `💧 Hydration Protocol: Drink 3-4 liters of water today to flush absorbed toxins naturally out of your kidneys.`;
    const trafficAdvice = `🚦 Commute Advisory: Keep vehicle windows rolled up with air recirculation ON during peak diesel exhaust hours.`;

    const fullEmailHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #070d19; color: #f8fafc; padding: 30px 22px; border-radius: 20px; max-width: 600px; margin: 0 auto; border: 1px solid #1e293b; line-height: 1.7;">
        <h2 style="color: #2dd4bf; margin: 0 0 6px;">Respira <span style="color: #38bdf8;">Flare</span> Care Sentinel</h2>
        <p style="color: #94a3b8; font-size: 13px; margin: 0 0 18px;">Dedicated atmospheric health companion for <b>${userName}</b></p>

        <div style="background: #0f172a; padding: 16px 18px; border-radius: 12px; margin-bottom: 20px; border: 1px solid #334155; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <span style="font-size: 11px; background: #134e4a; color: #2dd4bf; padding: 3px 10px; border-radius: 999px; font-weight: 700; text-transform: uppercase;">
              Condition Focus: ${cond}
            </span>
            <div style="color: #f1f5f9; font-size: 17px; font-weight: 700; margin-top: 6px;">📍 ${geo.name}</div>
          </div>
          <div style="text-align: right;">
            <div style="color: #94a3b8; font-size: 12px;">Live Air Index</div>
            <div style="color: #f59e0b; font-size: 22px; font-weight: 800;">${aqi} <span style="font-size: 13px; color: #94a3b8; font-weight: 400;">AQI</span></div>
          </div>
        </div>

        <div style="background: #134e4a25; border-left: 4px solid #2dd4bf; padding: 16px; border-radius: 8px; margin-bottom: 20px;">
          <h3 style="color: #2dd4bf; margin: 0 0 6px; font-size: 16px;">${detailedConditionTitle}</h3>
          <p style="color: #38bdf8; font-size: 13px; margin: 0 0 8px; font-weight: 600;">📋 Profile Match: ${profileContext}</p>
          <p style="color: #f1f5f9; font-size: 14px; margin: 0; line-height: 1.8;">${detailedConditionAdvice}</p>
        </div>

        <h4 style="color: #38bdf8; font-size: 15px; margin: 18px 0 10px;">🌿 Holistic 5-Step Action Directives:</h4>
        <div style="background: #0f172a; padding: 16px; border-radius: 12px; border: 1px solid #1e293b; font-size: 13px; color: #cbd5e1;">
          <p style="margin: 0 0 8px;">${cropAdvice}</p>
          <p style="margin: 0 0 8px;">${hydrationAdvice}</p>
          <p style="margin: 0;">${trafficAdvice}</p>
        </div>

        <div style="text-align: center; margin-top: 25px;">
          <a href="${skincareUrl}" style="background: linear-gradient(135deg, #14b8a6, #06b6d4); color: #020617; padding: 13px 26px; border-radius: 10px; font-weight: 800; font-size: 14px; text-decoration: none; display: inline-block;">
            👉 Open Facial Skin Analysis & Live Telemetry
          </a>
        </div>
      </div>
    `;

    const targetEmail = email || 'priyadharshinidhanasekaran057@gmail.com';
    let mailSuccess = false;

    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      try {
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
        });

        await transporter.sendMail({
          from: `"Respira Flare Companion" <${process.env.EMAIL_USER}>`,
          to: targetEmail,
          subject: `🌸 Dedicated Care for ${userName} (${cond.toUpperCase()} Alert - AQI ${aqi})`,
          html: fullEmailHtml,
        });
        mailSuccess = true;
        console.log('[Detailed Care Email Dispatched to]:', targetEmail);
      } catch (mErr: any) {
        console.error('[Email Error]:', mErr.message);
      }
    }

    return NextResponse.json({ success: true, smsDispatched: smsSuccess, emailDispatched: mailSuccess, sid: smsSid });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}