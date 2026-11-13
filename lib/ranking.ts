import { getSubscriptionFeatures } from "./subscription.js";

export const getAdRankingScore = async (userId: number) => {
    const features = await getSubscriptionFeatures(userId);
  
    return {
      featuredPlacement: features.featuredPlacement,
      visibilityBoost: features.visibilityBoost,
    };
  };