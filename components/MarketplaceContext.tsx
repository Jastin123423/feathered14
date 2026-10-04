import React from "react";

export const MarketplaceContext = React.createContext<{
  onViewProduct: (productId: number) => void;
  getProductData: (productId: number) => {
    price: number;
    location: string;
    currency?: string;
  } | null;
}>({
  onViewProduct: () => {},
  getProductData: () => null,
});
