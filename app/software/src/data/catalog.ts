import type { LucideIcon } from 'lucide-react';
import { BriefcaseBusiness, Code2, MonitorSmartphone } from 'lucide-react';

export interface TemplateSection {
  title: string;
  description: string;
  points: string[];
}

export interface SoftwareProduct {
  id: 'agency' | 'admin' | 'commerce' | 'landing' | 'mobile' | 'crm' | 'finance' | 'restaurant' | 'real-estate' | 'portfolio' | 'booking' | 'education';
  name: string;
  category: string;
  description: string;
  priceLabel: string;
  priceUsd: number;
  amountSatang: number;
  preview: {
    brand: string;
    theme: 'violet' | 'blue' | 'gold' | 'green' | 'coral' | 'dark';
    headline: string;
    description: string;
    action: string;
    navigation: string[];
    sections: TemplateSection[];
    footer: string;
  };
}

export const softwareCatalog: SoftwareProduct[] = [
  {
    id: 'agency', name: 'Agency Website Kit', category: 'Business website',
    description: 'A polished starting point for creative studios and service agencies.', priceLabel: '$899', priceUsd: 899, amountSatang: 89900,
    preview: { brand: 'Studio North', theme: 'coral', headline: 'Good ideas deserve a great digital home.', description: 'A considered website for independent studios ready to make their next move.', action: 'Explore our work', navigation: ['Work', 'Services', 'Studio'],
      sections: [{ title: 'Selected work', description: 'Lead with a carefully edited collection of projects and outcomes.', points: ['Project-led case studies', 'Flexible image-led layouts'] }, { title: 'What we do', description: 'Make your services easy to understand and easy to choose.', points: ['Brand and digital strategy', 'Web design and development'] }, { title: 'A little about us', description: 'Introduce the people and point of view behind the studio.', points: ['Team profiles', 'A clear, personal story'] }], footer: 'Thoughtful digital work, made together.' },
  },
  {
    id: 'admin', name: 'SaaS Admin Dashboard', category: 'SaaS dashboard',
    description: 'A clear interface for managing users, metrics, and product settings.', priceLabel: '$799', priceUsd: 799, amountSatang: 79900,
    preview: { brand: 'Orbit', theme: 'violet', headline: 'Your product, at a glance.', description: 'A calm and capable control center for your growing software business.', action: 'View dashboard', navigation: ['Overview', 'Customers', 'Reports'],
      sections: [{ title: 'One clear overview', description: 'Bring the most useful product signals into one readable view.', points: ['Active users and growth', 'Revenue and conversion trends'] }, { title: 'Understand your users', description: 'Find the account details and activity your team needs.', points: ['Searchable customer list', 'Recent account activity'] }, { title: 'Reports that make sense', description: 'Turn usage data into a practical picture of product health.', points: ['Time-based comparisons', 'At-a-glance reporting'] }], footer: 'A better view of the work behind your product.' },
  },
  {
    id: 'commerce', name: 'E-commerce Storefront', category: 'Online store',
    description: 'A product-first storefront concept for presenting your collection.', priceLabel: '$849', priceUsd: 849, amountSatang: 84900,
    preview: { brand: 'Form & Field', theme: 'gold', headline: 'Everyday objects, chosen with care.', description: 'A warm, editorial shop that gives your collection room to speak.', action: 'Shop the collection', navigation: ['Shop', 'Our story', 'Journal'],
      sections: [{ title: 'A collection worth browsing', description: 'Present products in an inviting, easy-to-scan storefront.', points: ['Editorial product cards', 'Clear category navigation'] }, { title: 'Details that build confidence', description: 'Give shoppers the information they need before they buy.', points: ['Materials and sizing', 'Shipping and returns'] }, { title: 'Meet the maker', description: 'Share the thinking and craft behind your products.', points: ['Brand story section', 'Journal and updates'] }], footer: 'Made with care. Considered for everyday.' },
  },
  {
    id: 'landing', name: 'SaaS Landing Page', category: 'Landing page',
    description: 'A focused layout for introducing and explaining a digital product.', priceLabel: '$549', priceUsd: 549, amountSatang: 54900,
    preview: { brand: 'Flowdesk', theme: 'blue', headline: 'Make room for your best work.', description: 'Bring projects, people, and progress together in one simple workspace.', action: 'See how it works', navigation: ['Product', 'Solutions', 'Pricing'],
      sections: [{ title: 'Everything in one flow', description: 'Explain the product value in a crisp, benefit-led section.', points: ['A shared project view', 'Fewer status meetings'] }, { title: 'Built for your team', description: 'Show how the product supports real day-to-day work.', points: ['Flexible team spaces', 'Simple progress tracking'] }, { title: 'Plans that scale with you', description: 'Make the next step clear with a straightforward pricing area.', points: ['Easy-to-compare plans', 'A clear signup call to action'] }], footer: 'Less busywork. More of your best work.' },
  },
  {
    id: 'mobile', name: 'Mobile App UI Starter', category: 'Mobile UI',
    description: 'A flexible visual foundation for a new mobile application.', priceLabel: '$699', priceUsd: 699, amountSatang: 69900,
    preview: { brand: 'Daylight', theme: 'green', headline: 'A little more balance, every day.', description: 'A friendly mobile experience for building routines that feel right for you.', action: 'Discover the app', navigation: ['The app', 'Our approach', 'Support'],
      sections: [{ title: 'A daily view that feels simple', description: 'Keep the important information close and distraction-free.', points: ['Personal daily summary', 'Comfortable mobile navigation'] }, { title: 'Small steps add up', description: 'Make routines feel approachable with clear progress cues.', points: ['Flexible habit tracking', 'Gentle progress feedback'] }, { title: 'Designed around you', description: 'Leave room to tailor the experience to different people.', points: ['Personal preferences', 'Accessible interface patterns'] }], footer: 'A calmer way to make the day your own.' },
  },
  {
    id: 'crm', name: 'CRM & Sales Dashboard', category: 'CRM dashboard',
    description: 'A practical concept for contacts, sales pipeline, and activity.', priceLabel: '$949', priceUsd: 949, amountSatang: 94900,
    preview: { brand: 'Relay', theme: 'green', headline: 'Every customer conversation, connected.', description: 'Keep your relationships, pipeline, and next steps moving together.', action: 'Explore the workspace', navigation: ['Pipeline', 'Contacts', 'Activity'],
      sections: [{ title: 'A pipeline with a clear next step', description: 'See opportunities by stage and focus on what needs attention.', points: ['At-a-glance deal stages', 'Clear follow-up actions'] }, { title: 'Know the whole relationship', description: 'Bring useful customer context together for your team.', points: ['Contact and company details', 'Notes and recent conversations'] }, { title: 'Momentum you can measure', description: 'Review team activity and sales progress in context.', points: ['Pipeline health summary', 'Recent team activity'] }], footer: 'Better conversations start with better context.' },
  },
  {
    id: 'finance', name: 'Finance Overview Dashboard', category: 'Finance dashboard',
    description: 'A composed finance overview for revenue, expenses, and cash flow.', priceLabel: '$999', priceUsd: 999, amountSatang: 99900,
    preview: { brand: 'Ledgerline', theme: 'dark', headline: 'A clearer picture of your numbers.', description: 'Bring the financial signals that matter into one composed overview.', action: 'View the overview', navigation: ['Overview', 'Cash flow', 'Reports'],
      sections: [{ title: 'Know where you stand', description: 'Keep balances and key changes easy to find.', points: ['Account balance summary', 'Recent movement overview'] }, { title: 'Follow the cash flow', description: 'See income and outgoings across a useful time range.', points: ['Readable trend charts', 'Category-level breakdown'] }, { title: 'Make reporting easier', description: 'Organize transactions so the bigger picture is clear.', points: ['Recent transaction list', 'Export-ready report layout'] }], footer: 'Clear numbers make confident decisions.' },
  },
  {
    id: 'restaurant', name: 'Restaurant & Cafe Website', category: 'Hospitality',
    description: 'A welcoming restaurant site with a menu, story, and visit details.', priceLabel: '$749', priceUsd: 749, amountSatang: 74900,
    preview: { brand: 'Juniper Table', theme: 'gold', headline: 'A good table brings people together.', description: 'A warm online welcome for neighborhood restaurants and independent cafes.', action: 'Explore the menu', navigation: ['Menu', 'Our place', 'Find us'],
      sections: [{ title: 'Made for sharing', description: 'Give your seasonal menu the spotlight it deserves.', points: ['Readable menu categories', 'Dietary notes and highlights'] }, { title: 'A place with a story', description: 'Introduce the people, ingredients, and ideas behind the kitchen.', points: ['Restaurant story section', 'Seasonal ingredients'] }, { title: 'Come by sometime', description: 'Make hours, location, and reservations easy to find.', points: ['Opening hours and map area', 'Reservation call to action'] }], footer: 'Good food, good company, right around the corner.' },
  },
  {
    id: 'real-estate', name: 'Real Estate Listings', category: 'Property',
    description: 'An elegant property discovery concept for listings and agents.', priceLabel: '$799', priceUsd: 799, amountSatang: 79900,
    preview: { brand: 'Hearth & Home', theme: 'coral', headline: 'Find a place that feels like yours.', description: 'A refined property experience built around the details that matter.', action: 'Browse properties', navigation: ['Buy', 'Rent', 'Our team'],
      sections: [{ title: 'Find your next place', description: 'Help people narrow down homes without losing the details.', points: ['Useful property filters', 'Clear listing cards'] }, { title: 'Space to picture life there', description: 'Let property photography and facts work together.', points: ['Room for gallery imagery', 'Key features at a glance'] }, { title: 'Local knowledge, personal service', description: 'Introduce your agents and the neighborhoods they know.', points: ['Agent profile cards', 'Neighborhood highlights'] }], footer: 'A better beginning starts at home.' },
  },
  {
    id: 'portfolio', name: 'Creative Portfolio Studio', category: 'Portfolio',
    description: 'A distinctive portfolio concept for independent creative professionals.', priceLabel: '$599', priceUsd: 599, amountSatang: 59900,
    preview: { brand: 'Mira Studio', theme: 'violet', headline: 'Ideas, made visible.', description: 'A minimal portfolio for sharing your perspective and the work behind it.', action: 'View selected work', navigation: ['Projects', 'About', 'Notes'],
      sections: [{ title: 'Selected projects', description: 'Let a focused body of work lead the conversation.', points: ['Flexible project layouts', 'Room for visual storytelling'] }, { title: 'A point of view', description: 'Share the skills and perspective you bring to each project.', points: ['Short creative introduction', 'Specialties and services'] }, { title: 'Notes from the studio', description: 'Add process, ideas, or occasional updates to your portfolio.', points: ['Simple article layout', 'Related project links'] }], footer: 'Independent ideas, thoughtfully realized.' },
  },
  {
    id: 'booking', name: 'Booking & Appointments', category: 'Service business',
    description: 'A service booking layout for appointments, schedules, and FAQs.', priceLabel: '$699', priceUsd: 699, amountSatang: 69900,
    preview: { brand: 'Stillpoint', theme: 'blue', headline: 'Make a little time for yourself.', description: 'A considered booking experience for independent practices and studios.', action: 'Explore sessions', navigation: ['Sessions', 'Our practice', 'FAQs'],
      sections: [{ title: 'Choose the right session', description: 'Explain your services clearly so visitors know where to start.', points: ['Service descriptions and duration', 'Straightforward pricing display'] }, { title: 'Meet your practitioner', description: 'Build confidence by introducing the people and approach.', points: ['Practitioner profiles', 'A welcoming introduction'] }, { title: 'Plan your visit', description: 'Answer common questions before an appointment is booked.', points: ['Location and preparation details', 'Booking information'] }], footer: 'Thoughtful care begins with a little time.' },
  },
  {
    id: 'education', name: 'Online Course Platform', category: 'Education',
    description: 'A course discovery concept for lessons, instructors, and learning paths.', priceLabel: '$649', priceUsd: 649, amountSatang: 64900,
    preview: { brand: 'Open Lesson', theme: 'blue', headline: 'Learn something you can put to work.', description: 'A focused course experience for practical ideas and steady progress.', action: 'Explore courses', navigation: ['Courses', 'Instructors', 'Learning paths'],
      sections: [{ title: 'Find your next subject', description: 'Help learners discover courses by goal and experience.', points: ['Browseable course categories', 'Clear skill-level labels'] }, { title: 'Learn from practitioners', description: 'Put instructors and their experience in the right context.', points: ['Instructor profiles', 'Practical course outcomes'] }, { title: 'Build knowledge step by step', description: 'Show how lessons and learning paths fit together.', points: ['Course curriculum preview', 'Progress-oriented learning paths'] }], footer: 'Curiosity is a great place to start.' },
  },
];

export const softwareServices: Array<{
  id: string;
  name: string;
  description: string;
  priceLabel: string;
  Icon: LucideIcon;
}> = [
  { id: 'website', name: 'Business Website Development', description: 'A tailored responsive website designed around your services and goals.', priceLabel: 'Custom quote · USD', Icon: BriefcaseBusiness },
  { id: 'dashboard', name: 'Dashboard & Business Software', description: 'Purpose-built interfaces and workflows for your team and operations.', priceLabel: 'Custom quote · USD', Icon: Code2 },
  { id: 'mobile', name: 'Mobile Application Development', description: 'A custom mobile product experience, from interface through development.', priceLabel: 'Custom quote · USD', Icon: MonitorSmartphone },
];
