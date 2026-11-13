import { getActiveSubscription } from "./premium.js";

export const getSubscriptionFeatures = async (userId: number) => {
  const subscription = await getActiveSubscription(userId);

  return {
    isSubscribed: Boolean(subscription),
    adLimit: subscription?.plan.adLimit ?? 50,
    featuredPlacement: subscription?.plan.featuredPlacement ?? false,
    visibilityBoost: subscription?.plan.visibilityBoost ?? 0,
  }
};
