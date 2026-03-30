const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const cookieParser = require('cookie-parser');
const { createClient } = require('@supabase/supabase-js');
const stripe = require('stripe');

// ১. কনফিগারেশন লোড করা
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// ২. ক্লায়েন্ট ইনিশিয়ালাইজেশন
// নিশ্চিত করুন আপনার .env ফাইলে এই কি (Keys) গুলো আছে
const stripeClient = stripe(process.env.STRIPE_SECRET_KEY);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY, // এর মাধ্যমে ব্যাকএন্ড থেকে সরাসরি অ্যাডমিন কাজ করা যাবে
);

// ৩. মিডলওয়্যার সেটআপ
app.use(
  cors({
    origin: [
      'http://localhost:5173',
      'https://the-spice-slice-clicent.vercel.app',
    ],
    credentials: true,
  }),
);
app.use(express.json());
app.use(cookieParser());

// ৪. কাস্টম এরর হ্যান্ডলার ফাংশন
const sendError = (res, err) => {
  console.error('🔥 Server Error:', err.message || err);
  res.status(err.status || 400).send({
    success: false,
    message: err.message || 'An unexpected error occurred',
    error: err,
  });
};

// --- ৫. ROUTES: FOOD MANAGEMENT ---

// সব খাবার পাওয়া (Home/Menu Page)
app.get('/foods', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('foods')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.send(data);
  } catch (err) {
    sendError(res, err);
  }
});

// নির্দিষ্ট খাবার পাওয়া (Details Page)
app.get('/foods/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('foods')
      .select('*')
      .eq('id', id)
      .single();
    if (error)
      return res.status(404).send({ message: 'Masterpiece not found' });
    res.send(data);
  } catch (err) {
    sendError(res, err);
  }
});

// ইউজারের নিজের খাবার দেখা (My Foods/Admin Manage)
app.get('/my-foods', async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) throw new Error('Email is required');
    const { data, error } = await supabase
      .from('foods')
      .select('*')
      .eq('created_by_email', email);
    if (error) throw error;
    res.send(data);
  } catch (err) {
    sendError(res, err);
  }
});

// নতুন খাবার যোগ করা (Admin)
app.post('/foods', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('foods')
      .insert([req.body])
      .select();
    if (error) throw error;
    res.send({ success: true, data });
  } catch (err) {
    sendError(res, err);
  }
});

// খাবার আপডেট করা (Edit/Refine)
app.patch('/foods/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('foods')
      .update(req.body)
      .eq('id', id)
      .select();
    if (error) throw error;
    res.send({ success: true, data });
  } catch (err) {
    sendError(res, err);
  }
});

// খাবার ডিলিট করা
app.delete('/foods/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from('foods').delete().eq('id', id);
    if (error) throw error;
    res.send({ success: true, message: 'Delicacy removed successfully' });
  } catch (err) {
    sendError(res, err);
  }
});

// --- ৬. ROUTES: ORDER & STRIPE PAYMENT ---

// Stripe Payment Intent তৈরি করা
app.post('/create-payment-intent', async (req, res) => {
  try {
    const { price } = req.body;
    if (!price || isNaN(price))
      return res.status(400).send({ error: 'Valid price is required' });

    // ১. সেন্টে রূপান্তর (Integer এ রাউন্ড করা জরুরি)
    const amount = Math.round(parseFloat(price) * 100);

    if (amount < 50)
      return res.status(400).send({ error: 'Minimum amount is $0.50' });

    const paymentIntent = await stripeClient.paymentIntents.create({
      amount: amount,
      currency: 'usd',
      payment_method_types: ['card'],
    });

    res.send({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    console.error('❌ Stripe Error:', err.message);
    res.status(500).send({ error: err.message });
  }
});

// অর্ডারের ডাটা সেভ করা (Checkout সফল হলে)
// backend/index.js এর ভেতরে /applications রুটটি আপডেট করুন

// backend/index.js এর ভেতরে অর্ডার সেভ করার অংশ
// backend/index.js এর পেমেন্ট সাকসেস লজিক
app.post('/applications', async (req, res) => {
  try {
    const orderData = {
      ...req.body,
      status: 'paid', // নিশ্চিত করুন স্ট্যাটাসটি 'paid'
      created_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('applications')
      .insert([orderData]);

    if (error) throw error;
    res.status(201).send({ success: true, data });
  } catch (err) {
    res.status(400).send({ error: err.message });
  }
});
// ইউজারের সব অর্ডার দেখা (Dashboard - Ledger/Purchase List)
app.get('/applications', async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).send({ error: 'Patron email required' });

    const { data, error } = await supabase
      .from('applications')
      .select('*, foods (*)') // Relational Join
      .eq('applicant_email', email)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.send(data);
  } catch (err) {
    sendError(res, err);
  }
});

// অ্যাডমিনের জন্য সব অর্ডার দেখা (Admin Control)
app.get('/admin/all-orders', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('applications')
      .select('*, foods (*)')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.send(data);
  } catch (err) {
    sendError(res, err);
  }
});

// অর্ডার ডিলিট করা
// backend/index.js
app.delete('/applications/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Supabase এ ডিলিট কমান্ড
    const { data, error } = await supabase
      .from('applications')
      .delete()
      .eq('id', id); // এখানে id চেক করুন, আপনার কলাম নাম 'id' নাকি '_id'

    if (error) throw error;

    res.send({
      success: true,
      message: 'Transaction removed from boutique ledger',
    });
  } catch (err) {
    res.status(400).send({ success: false, error: err.message });
  }
});

// --- ৭. SERVER START ---
app.get('/', (req, res) =>
  res.send('💎 The Spice-Slice Boutique Server is Running...'),
);

app.listen(port, () => {
  console.log(`🚀 Boutique Server active on port ${port}`);
});
