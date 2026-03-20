import Link from 'next/link';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-950 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-8">Privacy Policy</h1>

        <div className="prose prose-invert prose-gray max-w-none space-y-6 text-gray-300">
          <p className="text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4 text-sm">
            <strong>Note:</strong> This is a placeholder privacy policy. It must be reviewed by legal counsel before launch.
          </p>

          <h2 className="text-xl font-semibold text-white">1. Information We Collect</h2>
          <p>We collect information you provide when creating an account (name, email, company), data you upload (contacts, sequences), and usage data (feature usage, login activity).</p>

          <h2 className="text-xl font-semibold text-white">2. How We Use Your Information</h2>
          <p>We use your information to provide and improve the service, send transactional emails, and ensure account security.</p>

          <h2 className="text-xl font-semibold text-white">3. Data Storage and Security</h2>
          <p>Your data is stored on encrypted servers. We use industry-standard security measures including TLS encryption, password hashing, and access controls.</p>

          <h2 className="text-xl font-semibold text-white">4. Data Sharing</h2>
          <p>We do not sell your data. We may share data with service providers who help us operate the platform (hosting, email delivery) under strict data processing agreements.</p>

          <h2 className="text-xl font-semibold text-white">5. Your Rights</h2>
          <p>You have the right to access, export, and delete your data at any time through your account settings. You may also request data deletion by contacting support.</p>

          <h2 className="text-xl font-semibold text-white">6. Data Retention</h2>
          <p>We retain your data while your account is active. After account deletion, data is permanently removed within 30 days.</p>

          <h2 className="text-xl font-semibold text-white">7. Cookies</h2>
          <p>We use essential cookies for authentication and session management. We do not use third-party tracking cookies.</p>

          <h2 className="text-xl font-semibold text-white">8. GDPR Compliance</h2>
          <p>For EU users, we process data under legitimate interest and consent bases. You may exercise your GDPR rights by contacting us.</p>

          <h2 className="text-xl font-semibold text-white">9. Changes to This Policy</h2>
          <p>We will notify you of significant changes via email. Continued use of the service after changes constitutes acceptance.</p>

          <h2 className="text-xl font-semibold text-white">10. Contact</h2>
          <p>For privacy inquiries, contact us at privacy@saleshub.com.</p>

          <p className="text-sm text-gray-500 mt-8">Last updated: March 2026</p>
        </div>

        <div className="mt-8 flex gap-4 text-sm">
          <Link href="/terms" className="text-blue-400 hover:text-blue-300">Terms of Service</Link>
          <Link href="/signup" className="text-blue-400 hover:text-blue-300">Sign Up</Link>
          <Link href="/login" className="text-blue-400 hover:text-blue-300">Login</Link>
        </div>
      </div>
    </div>
  );
}
