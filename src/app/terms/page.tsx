import Link from 'next/link';

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gray-950 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-8">Terms of Service</h1>

        <div className="prose prose-invert prose-gray max-w-none space-y-6 text-gray-300">
          <p className="text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4 text-sm">
            <strong>Note:</strong> These are placeholder terms. They must be reviewed by legal counsel before launch.
          </p>

          <h2 className="text-xl font-semibold text-white">1. Acceptance of Terms</h2>
          <p>By accessing or using SalesHub, you agree to be bound by these Terms of Service. If you do not agree, do not use the service.</p>

          <h2 className="text-xl font-semibold text-white">2. Description of Service</h2>
          <p>SalesHub is a customer relationship management and sales outreach platform. We provide tools for managing contacts, email sequences, and sales workflows.</p>

          <h2 className="text-xl font-semibold text-white">3. User Accounts</h2>
          <p>You must provide accurate information when creating an account. You are responsible for maintaining the security of your account credentials.</p>

          <h2 className="text-xl font-semibold text-white">4. Acceptable Use</h2>
          <p>You agree to use SalesHub only for lawful purposes and in compliance with all applicable laws, including CAN-SPAM, GDPR, and other email marketing regulations.</p>

          <h2 className="text-xl font-semibold text-white">5. Data Ownership</h2>
          <p>You retain ownership of all data you upload to SalesHub. We do not sell your data to third parties.</p>

          <h2 className="text-xl font-semibold text-white">6. Service Availability</h2>
          <p>We strive to maintain high availability but do not guarantee uninterrupted service. We are not liable for any downtime or data loss.</p>

          <h2 className="text-xl font-semibold text-white">7. Termination</h2>
          <p>Either party may terminate the agreement at any time. Upon termination, you may export your data within 30 days before it is permanently deleted.</p>

          <h2 className="text-xl font-semibold text-white">8. Limitation of Liability</h2>
          <p>SalesHub is provided &ldquo;as is&rdquo; without warranties. Our liability is limited to the amount you paid for the service in the preceding 12 months.</p>

          <h2 className="text-xl font-semibold text-white">9. Changes to Terms</h2>
          <p>We may update these terms from time to time. We will notify you of significant changes via email or in-app notification.</p>

          <p className="text-sm text-gray-500 mt-8">Last updated: March 2026</p>
        </div>

        <div className="mt-8 flex gap-4 text-sm">
          <Link href="/privacy" className="text-blue-400 hover:text-blue-300">Privacy Policy</Link>
          <Link href="/signup" className="text-blue-400 hover:text-blue-300">Sign Up</Link>
          <Link href="/login" className="text-blue-400 hover:text-blue-300">Login</Link>
        </div>
      </div>
    </div>
  );
}
