import React from "react";

export type ProductMeta = {
  price: number;
  location: string;
  currency?: string;
};

export type MarketplaceContextValue = {
  onViewProduct: (productId: number) => void;
  getProductData: (productId: number) => ProductMeta | null;
};

export const MarketplaceContext = React.createContext<MarketplaceContextValue>({
  onViewProduct: () => {},
  getProductData: () => null,
});
