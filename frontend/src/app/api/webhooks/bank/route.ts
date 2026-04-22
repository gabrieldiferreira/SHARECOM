// src/app/api/webhooks/bank/route.ts
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createTransaction, getTransactions, updateTransaction } from '@/lib/firestore';

export async function POST(req: NextRequest) {
  try {
    const signature = req.headers.get('x-webhook-signature');
    const body = await req.text();
    
    const expectedSignature = crypto
      .createHmac('sha256', process.env.WEBHOOK_SECRET!)
      .update(body)
      .digest('hex');

    if (signature !== expectedSignature) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const data = JSON.parse(body);
    const {
      user_id,
      transaction_external_id,
      amount_cents,
      type,
      merchant_name,
      datetime,
      payment_method,
      pix_key,
      authentication_code,
    } = data;

    const existingTransactions = await getTransactions(user_id, {
      start: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
    });
    const existing = existingTransactions.find(
      (transaction) => transaction.transactionExternalId === transaction_external_id,
    );

    if (existing) {
      return NextResponse.json({ status: 'duplicate', id: existing.id });
    }

    const transaction = await createTransaction(user_id, {
      amount: Number(amount_cents ?? 0),
      type: type === 'income' ? 'income' : 'expense',
      merchant: merchant_name,
      merchantLogoUrl: null,
      category: 'other',
      paymentMethod: payment_method,
      pixKey: pix_key,
      authenticationCode: authentication_code,
      datetime: new Date(datetime),
      location: null,
      tags: [],
      isRecurring: false,
      description: null,
      transactionExternalId: transaction_external_id,
      deletedAt: null,
    });

    if (merchant_name && transaction.id) {
      fetch(`https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(merchant_name)}&inputtype=textquery&fields=photos&key=${process.env.GOOGLE_PLACES_API_KEY}`)
        .then(res => res.json())
        .then(async (places) => {
          if (places.candidates?.[0]?.photos?.[0]) {
            const photoRef = places.candidates[0].photos[0].photo_reference;
            const logoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference=${photoRef}&key=${process.env.GOOGLE_PLACES_API_KEY}`;

            await updateTransaction(transaction.id, { merchantLogoUrl: logoUrl });
          }
        })
        .catch(err => console.error('Logo fetch error:', err));

      fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(merchant_name)}&key=${process.env.GOOGLE_GEOCODING_API_KEY}`)
        .then(res => res.json())
        .then(async (geo) => {
          if (geo.results?.[0]?.geometry?.location) {
            const { lat, lng } = geo.results[0].geometry.location;

            await updateTransaction(transaction.id, { location: `${lat},${lng}` });
          }
        })
        .catch(err => console.error('Geocode error:', err));
    }

    if (process.env.PUSHER_APP_ID) {
      try {
        const { default: Pusher } = await import('pusher');
        const pusher = new Pusher({
          appId: process.env.PUSHER_APP_ID,
          key: process.env.PUSHER_KEY!,
          secret: process.env.PUSHER_SECRET!,
          cluster: process.env.PUSHER_CLUSTER!,
        });

        await pusher.trigger(`private-user-${user_id}`, 'transaction.created', { transaction });
      } catch (err) {
        console.warn('Pusher not available:', err);
      }
    }

    return NextResponse.json({ status: 'success', id: transaction.id }, { status: 201 });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
