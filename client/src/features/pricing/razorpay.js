// Razorpay Standard Checkout in the browser: load checkout.js once, open it for an order created by
// our server, and resolve with the three values the server verifies. Card/UPI details are entered in
// Razorpay's own window - they never touch this app.
const SRC = 'https://checkout.razorpay.com/v1/checkout.js';
let loading = null;

export function loadCheckout() {
  if (window.Razorpay) return Promise.resolve();
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loading = null;
      s.remove();
      reject(new Error('Could not load Razorpay Checkout. Check your internet connection or turn off ad-blockers for this site.'));
    };
    document.body.appendChild(s);
  });
  return loading;
}

/**
 * Opens Checkout. Resolves { razorpay_order_id, razorpay_payment_id, razorpay_signature } on success;
 * rejects with err.cancelled = true when the buyer closes the window.
 */
export async function openCheckout(order, { onFailure } = {}) {
  await loadCheckout();
  return new Promise((resolve, reject) => {
    const rzp = new window.Razorpay({
      key: order.keyId,
      order_id: order.orderId,
      amount: order.amountPaise,
      currency: order.currency,
      name: 'Review Intelligence',
      description: order.description,
      prefill: { name: order.prefill?.name, email: order.prefill?.email },
      notes: { plan: order.plan },
      theme: { color: '#8e1b1b' },
      modal: {
        confirm_close: true,
        ondismiss: () => reject(Object.assign(new Error('Payment window closed. No money was taken.'), { cancelled: true })),
      },
      handler: (response) => resolve(response),
    });
    // Razorpay lets the buyer retry inside the same window; we only record the failure.
    rzp.on('payment.failed', (resp) => onFailure?.(resp?.error));
    rzp.open();
  });
}

export const inr = (paise) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(paise / 100);
