import type { Metadata } from 'next';
import PricingContent from './PricingContent';

export const metadata: Metadata = {
  title: 'Pricing — ResearchMind AI',
  description: 'Simple monthly plans for serious research. Start free, upgrade when you need more.',
};

export default function PricingPage() {
  return <PricingContent />;
}
