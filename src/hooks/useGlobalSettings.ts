import * as React from 'react';
import { type ShopType } from '@/lib/pricing';

export function useGlobalSettings() {
  const [margins, setMargins] = React.useState<Record<ShopType, number>>({
    premium: 3,
    gold: 5,
    silver: 7,
    bronze: 10,
    basic: 15,
  });
  const [categoryMargins, setCategoryMargins] = React.useState<Record<string, number>>({
    "Whole Spices": 5,
    "Process Spices": 7,
    "Blended Spices": 8,
    "Basic Spices": 4,
    "Food Items": 3,
    "Oil & Ghee": 2,
    "Dry Fruits": 4,
  });
  const [varianceThreshold, setVarianceThreshold] = React.useState<number>(5);
  const [loading, setLoading] = React.useState(false);

  const updateMargins = async (newMargins: Record<ShopType, number>) => {
    setLoading(true);
    localStorage.setItem('bm_global_margins', JSON.stringify(newMargins));
    setMargins(newMargins);
    setLoading(false);
  };

  const updateCategoryMargins = async (newCats: Record<string, number>) => {
    setLoading(true);
    localStorage.setItem('bm_category_margins', JSON.stringify(newCats));
    setCategoryMargins(newCats);
    setLoading(false);
  };

  const updateVarianceThreshold = async (val: number) => {
    setLoading(true);
    localStorage.setItem('bm_variance_threshold', String(val));
    setVarianceThreshold(val);
    setLoading(false);
  };

  React.useEffect(() => {
    const saved = localStorage.getItem('bm_global_margins');
    if (saved) {
      try { setMargins(JSON.parse(saved)); } catch (e) { console.error(e); }
    }
    const savedCats = localStorage.getItem('bm_category_margins');
    if (savedCats) {
      try { setCategoryMargins(JSON.parse(savedCats)); } catch (e) { console.error(e); }
    }
    const savedVariance = localStorage.getItem('bm_variance_threshold');
    if (savedVariance) {
      setVarianceThreshold(Number(savedVariance));
    }
  }, []);

  return { 
    margins, 
    updateMargins, 
    categoryMargins, 
    updateCategoryMargins, 
    varianceThreshold,
    updateVarianceThreshold,
    loading 
  };
}
