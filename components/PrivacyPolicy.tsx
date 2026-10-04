

// components/PrivacyPolicy.tsx
import React from 'react';
import { useNavigate } from 'react-router-dom';

export const PrivacyPolicyPage: React.FC = () => {
  const navigate = useNavigate();

  const handleGoHome = () => {
    navigate('/');
  };

  return (
    <div className="w-full min-h-screen bg-[#050B18] font-sans text-[#F8FAFC] pb-20">
      {/* Header */}
      <div className="bg-[#0B1120] border-b border-[#1E293B] sticky top-0 z-50 shadow-sm">
        <div className="max-w-[1000px] mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={handleGoHome}>
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#1877F2] to-[#1D8AF2] flex items-center justify-center shadow-[0_0_14px_rgba(24,119,242,0.25)]">
              <i className="fas fa-globe-africa text-white text-[16px]"></i>
            </div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-[#1877F2] to-[#59A7FF] text-transparent bg-clip-text">
              UNERA Privacy
            </h1>
          </div>
          <button 
            onClick={handleGoHome} 
            className="text-[#94A3B8] hover:text-[#F8FAFC] font-semibold text-sm transition-colors px-4 py-2 rounded-full hover:bg-[#1E293B]"
          >
            ← Back to Home
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-[800px] mx-auto px-4 py-8 animate-fade-in">
        <div className="mb-8 border-b border-[#1E293B] pb-6">
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">Privacy Policy</h1>
          <p className="text-[#94A3B8]">Effective Date: February 14, 2025</p>
        </div>

        <div className="space-y-10 text-[16px] leading-relaxed text-[#CBD5E1]">
          <section>
            <h2 className="text-xl font-bold text-white mb-3">1. Introduction</h2>
            <p>Welcome to UNERA. We respect your privacy and are committed to protecting your personal data. This privacy policy will inform you as to how we look after your personal data when you visit our website or use our application and tell you about your privacy rights and how the law protects you.</p>
            <p className="mt-3">This policy applies to all users of UNERA, whether you're using our web application, mobile site, or any other services we provide. By using UNERA, you agree to the collection and use of information in accordance with this policy.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">2. Data We Collect</h2>
            <p className="mb-3">We may collect, use, store and transfer different kinds of personal data about you which we have grouped together as follows:</p>
            <ul className="list-disc list-inside space-y-2 ml-2 text-[#94A3B8]">
              <li>
                <strong className="text-[#F8FAFC]">Identity Data:</strong> includes first name, last name, username or similar identifier, marital status, title, date of birth and gender.
              </li>
              <li>
                <strong className="text-[#F8FAFC]">Contact Data:</strong> includes email address and telephone numbers.
              </li>
              <li>
                <strong className="text-[#F8FAFC]">Technical Data:</strong> includes internet protocol (IP) address, your login data, browser type and version, time zone setting and location, browser plug-in types and versions, operating system and platform, and other technology on the devices you use to access this website.
              </li>
              <li>
                <strong className="text-[#F8FAFC]">Profile Data:</strong> includes your username and password, purchases or orders made by you, your interests, preferences, feedback and survey responses.
              </li>
              <li>
                <strong className="text-[#F8FAFC]">Usage Data:</strong> includes information about how you use our website, products and services, including your interactions with posts, reels, groups, events, marketplace, and music features.
              </li>
              <li>
                <strong className="text-[#F8FAFC]">Marketing and Communications Data:</strong> includes your preferences in receiving marketing from us and our third parties and your communication preferences.
              </li>
              <li>
                <strong className="text-[#F8FAFC]">Content Data:</strong> includes any content you create, upload, or share on UNERA, such as posts, comments, photos, videos, music playlists, and messages.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">3. How We Use Your Data</h2>
            <p className="mb-3">We will only use your personal data when the law allows us to. Most commonly, we will use your personal data in the following circumstances:</p>
            <div className="bg-[#0B1120] p-4 rounded-xl border border-[#1E293B]">
              <ul className="space-y-3">
                <li className="flex gap-3">
                  <i className="fas fa-check-circle text-[#45BD62] mt-1 flex-shrink-0"></i>
                  <span><strong>Service Provision:</strong> To register you as a new customer and provide the services you request, including maintaining your profile, facilitating connections, and enabling content sharing.</span>
                </li>
                <li className="flex gap-3">
                  <i className="fas fa-check-circle text-[#45BD62] mt-1 flex-shrink-0"></i>
                  <span><strong>Relationship Management:</strong> To manage our relationship with you including notifying you about changes to our terms or privacy policy, and providing customer support.</span>
                </li>
                <li className="flex gap-3">
                  <i className="fas fa-check-circle text-[#45BD62] mt-1 flex-shrink-0"></i>
                  <span><strong>Personalization:</strong> To deliver relevant content, recommendations, and advertisements to you and measure the effectiveness of the advertising we serve to you.</span>
                </li>
                <li className="flex gap-3">
                  <i className="fas fa-check-circle text-[#45BD62] mt-1 flex-shrink-0"></i>
                  <span><strong>Analytics & Improvement:</strong> To improve our website, products/services, marketing, customer relationships and experiences through data analysis and research.</span>
                </li>
                <li className="flex gap-3">
                  <i className="fas fa-check-circle text-[#45BD62] mt-1 flex-shrink-0"></i>
                  <span><strong>Safety & Security:</strong> To maintain the safety, security, and integrity of UNERA, including detecting and preventing fraud, abuse, and violations of our terms.</span>
                </li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">4. How We Share Your Data</h2>
            <p className="mb-3">We may share your personal data with the parties set out below:</p>
            <ul className="list-disc list-inside space-y-2 ml-2 text-[#94A3B8]">
              <li><strong className="text-[#F8FAFC]">Other UNERA Users:</strong> Information you share publicly on your profile or in content you post will be visible to other users according to your privacy settings.</li>
              <li><strong className="text-[#F8FAFC]">Service Providers:</strong> Third-party vendors who provide IT and system administration services, payment processing, data analytics, hosting, and customer support.</li>
              <li><strong className="text-[#F8FAFC]">Legal Authorities:</strong> Where required by law, to respond to legal process, or to protect the rights, property, or safety of UNERA, our users, or the public.</li>
              <li><strong className="text-[#F8FAFC]">Business Transfers:</strong> In connection with any merger, sale of company assets, financing, or acquisition of all or a portion of our business.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">5. Data Security</h2>
            <p>We have put in place appropriate security measures to prevent your personal data from being accidentally lost, used or accessed in an unauthorized way, altered or disclosed. In addition, we limit access to your personal data to those employees, agents, contractors and other third parties who have a business need to know. They will only process your personal data on our instructions and they are subject to a duty of confidentiality.</p>
            <p className="mt-3">We have put in place procedures to deal with any suspected personal data breach and will notify you and any applicable regulator of a breach where we are legally required to do so.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">6. Data Retention</h2>
            <p>We will only retain your personal data for as long as necessary to fulfill the purposes we collected it for, including for the purposes of satisfying any legal, accounting, or reporting requirements.</p>
            <p className="mt-3">To determine the appropriate retention period for personal data, we consider the amount, nature, and sensitivity of the personal data, the potential risk of harm from unauthorized use or disclosure of your personal data, the purposes for which we process your personal data and whether we can achieve those purposes through other means, and the applicable legal requirements.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">7. Your Legal Rights</h2>
            <p className="mb-3">Under certain circumstances, you have rights under data protection laws in relation to your personal data, including the right to:</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-[#0B1120] p-4 rounded-xl border border-[#1E293B] hover:border-[#1877F2]/30 transition-colors">
                <div className="flex items-center gap-2 mb-2">
                  <i className="fas fa-eye text-[#1877F2]"></i>
                  <h3 className="font-bold text-[#1877F2]">Request Access</h3>
                </div>
                <p className="text-sm text-[#94A3B8]">Request a copy of the personal data we hold about you. This enables you to receive a copy of the personal data we hold about you and to check that we are lawfully processing it.</p>
              </div>
              <div className="bg-[#0B1120] p-4 rounded-xl border border-[#1E293B] hover:border-[#1877F2]/30 transition-colors">
                <div className="flex items-center gap-2 mb-2">
                  <i className="fas fa-edit text-[#1877F2]"></i>
                  <h3 className="font-bold text-[#1877F2]">Request Correction</h3>
                </div>
                <p className="text-sm text-[#94A3B8]">Request correction of the personal data that we hold about you. This enables you to have any incomplete or inaccurate data we hold about you corrected.</p>
              </div>
              <div className="bg-[#0B1120] p-4 rounded-xl border border-[#1E293B] hover:border-[#1877F2]/30 transition-colors">
                <div className="flex items-center gap-2 mb-2">
                  <i className="fas fa-trash-alt text-[#1877F2]"></i>
                  <h3 className="font-bold text-[#1877F2]">Request Erasure</h3>
                </div>
                <p className="text-sm text-[#94A3B8]">Request deletion of your personal data where there is no good reason for us continuing to process it. You also have the right to ask us to delete or remove your personal data.</p>
              </div>
              <div className="bg-[#0B1120] p-4 rounded-xl border border-[#1E293B] hover:border-[#1877F2]/30 transition-colors">
                <div className="flex items-center gap-2 mb-2">
                  <i className="fas fa-ban text-[#1877F2]"></i>
                  <h3 className="font-bold text-[#1877F2]">Withdraw Consent</h3>
                </div>
                <p className="text-sm text-[#94A3B8]">Withdraw consent at any time where we are relying on consent to process your personal data. This will not affect the lawfulness of any processing carried out before you withdraw your consent.</p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">8. Cookies and Tracking Technologies</h2>
            <p className="mb-3">We use cookies and similar tracking technologies to track the activity on our service and hold certain information. Cookies are files with small amount of data which may include an anonymous unique identifier.</p>
            <p className="mb-3">We use the following types of cookies:</p>
            <ul className="list-disc list-inside space-y-2 ml-2 text-[#94A3B8]">
              <li><strong className="text-[#F8FAFC]">Essential Cookies:</strong> Necessary for the website to function and cannot be switched off in our systems.</li>
              <li><strong className="text-[#F8FAFC]">Performance Cookies:</strong> Allow us to count visits and traffic sources so we can measure and improve the performance of our site.</li>
              <li><strong className="text-[#F8FAFC]">Functional Cookies:</strong> Enable the website to provide enhanced functionality and personalization.</li>
              <li><strong className="text-[#F8FAFC]">Targeting Cookies:</strong> May be set through our site by our advertising partners to build a profile of your interests.</li>
            </ul>
            <p className="mt-3">You can set your browser to refuse all or some browser cookies, or to alert you when websites set or access cookies. If you disable or refuse cookies, please note that some parts of this website may become inaccessible or not function properly.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">9. Children's Privacy</h2>
            <p>Our Service is not intended for use by children under the age of 13. We do not knowingly collect personally identifiable information from children under 13. If you become aware that a child has provided us with personal data without parental consent, please contact us. If we become aware that we have collected personal data from children without verification of parental consent, we take steps to remove that information from our servers.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">10. International Transfers</h2>
            <p>UNERA is based in Tanzania, but our servers and service providers may be located in different countries. Whenever we transfer your personal data out of your country of residence, we ensure a similar degree of protection is afforded to it by implementing appropriate safeguards.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">11. Changes to This Policy</h2>
            <p>We may update this privacy policy from time to time. We will notify you of any changes by posting the new privacy policy on this page and updating the "Effective Date" at the top. You are advised to review this privacy policy periodically for any changes. Changes to this privacy policy are effective when they are posted on this page.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">12. Contact Us</h2>
            <p>If you have any questions about this privacy policy or our privacy practices, or if you wish to exercise any of your legal rights, please contact us at:</p>
            <div className="mt-4 p-6 bg-[#0B1120] rounded-xl border border-[#1E293B] inline-block">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <i className="fas fa-envelope text-[#1877F2] text-xl"></i>
                  <div>
                    <p className="text-[#94A3B8] text-sm">Email</p>
                    <p className="text-[#F8FAFC] font-semibold">privacy@unera.social</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <i className="fas fa-globe text-[#1877F2] text-xl"></i>
                  <div>
                    <p className="text-[#94A3B8] text-sm">Website</p>
                    <p className="text-[#F8FAFC] font-semibold">https://unera.social</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <div className="mt-12 pt-8 border-t border-[#1E293B] text-center">
            <p className="text-[#94A3B8] text-sm mb-4">By using UNERA, you acknowledge that you have read and understood this Privacy Policy.</p>
            <button
              onClick={handleGoHome}
              className="inline-flex items-center gap-2 px-6 py-3 bg-[#1877F2] hover:bg-[#166FE5] text-white font-semibold rounded-full transition-colors"
            >
              <i className="fas fa-home"></i>
              Return to UNERA
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicyPage;

