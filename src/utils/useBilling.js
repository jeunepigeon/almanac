// Hook pour gérer les donations via expo-iap (Google Play Billing).
//
// Produits à créer dans la Google Play Console (consumable in-app products) :
//   small_tip   0.99€
//   coffee      1.99€
//   beer        4.99€
//   meal        9.99€
//   legend     19.99€
//   ultra      49.99€

import { useState, useEffect, useCallback } from 'react';
import {
  initConnection,
  endConnection,
  fetchProducts,
  requestPurchase,
  finishTransaction,
  purchaseUpdatedListener,
  purchaseErrorListener,
} from 'expo-iap';

export const DONATION_PRODUCTS = [
  { id: 'small_tip', label: 'Small tip', emoji: '☕', price: '0,99 €' },
  { id: 'coffee',    label: 'Coffee',    emoji: '☕', price: '1,99 €' },
  { id: 'beer',      label: 'Beer',      emoji: '🍺', price: '4,99 €' },
  { id: 'meal',      label: 'Meal',      emoji: '🍽️', price: '9,99 €' },
  { id: 'legend',    label: 'Legend',    emoji: '👑', price: '19,99 €' },
  { id: 'ultra',     label: 'Ultra',     emoji: '🚀', price: '49,99 €' },
];

const PRODUCT_IDS = DONATION_PRODUCTS.map((p) => p.id);

export function useBilling() {
  const [connected, setConnected] = useState(false);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [purchasing, setPurchasing] = useState(null);
  const [error, setError] = useState(null);
  const [thanksPending, setThanksPending] = useState(false);

  useEffect(() => {
    let mounted = true;
    let purchaseSub = null;
    let errorSub = null;

    async function setup() {
      try {
        const ok = await initConnection();
        if (!mounted) return;
        if (!ok) {
          setError('Service de paiement indisponible');
          return;
        }
        setConnected(true);

        purchaseSub = purchaseUpdatedListener(async (purchase) => {
          if (!mounted) return;
          try {
            await finishTransaction({ purchase, isConsumable: true });
            setPurchasing(null);
            setThanksPending(true);
          } catch (e) {
            setError(e.message || String(e));
            setPurchasing(null);
          }
        });

        errorSub = purchaseErrorListener((err) => {
          if (!mounted) return;
          setPurchasing(null);
          if (err?.code !== 'E_USER_CANCELLED') {
            setError(err?.message || 'Erreur lors du paiement');
          }
        });

        setLoading(true);
        const fetched = await fetchProducts({ skus: PRODUCT_IDS, type: 'inapp' });
        if (!mounted) return;
        setProducts(fetched || []);
        setLoading(false);
      } catch (e) {
        if (!mounted) return;
        setError(e.message || String(e));
        setLoading(false);
      }
    }

    setup();

    return () => {
      mounted = false;
      try { purchaseSub?.remove?.(); } catch {}
      try { errorSub?.remove?.(); } catch {}
      endConnection().catch(() => {});
    };
  }, []);

  const purchase = useCallback(async (productId) => {
    if (!connected || purchasing) return;
    setError(null);
    setPurchasing(productId);
    try {
      await requestPurchase({
        request: {
          android: { skus: [productId] },
          ios: { sku: productId },
        },
        type: 'inapp',
      });
    } catch (e) {
      setPurchasing(null);
      setError(e.message || String(e));
    }
  }, [connected, purchasing]);

  const getLocalPrice = useCallback((productId) => {
    const detail = products.find((p) => p.id === productId || p.productId === productId);
    if (detail?.displayPrice) return detail.displayPrice;
    if (detail?.price) return detail.price;
    return DONATION_PRODUCTS.find((p) => p.id === productId)?.price ?? '';
  }, [products]);

  const consumeThanks = useCallback(() => setThanksPending(false), []);

  return {
    connected,
    loading,
    purchasing,
    error,
    purchase,
    getLocalPrice,
    thanksPending,
    consumeThanks,
  };
}
