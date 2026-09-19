import type { Metadata } from 'next';
import ContactContent from './ContactContent';

export const metadata: Metadata = {
  title: 'Contact — ResearchMind AI',
  description: 'Questions, feedback or support requests — get in touch with the ResearchMind AI team.',
};

export default function ContactPage() {
  return <ContactContent />;
}
