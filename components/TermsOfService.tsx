



// components/TermsOfService.tsx
import React from 'react';
import { useNavigate } from 'react-router-dom';

export const TermsOfServicePage: React.FC = () => {
  const navigate = useNavigate();

  const handleGoHome = () => {
    navigate('/');
  };

  return (
    <div className="w-full min-h-screen bg-[#050B18] font-sans text-[#F8FAFC] pb-20">
      {/* Header */}
      <div className="bg-[#0F172A] border-b border-[#1E293B] sticky top-0 z-50 shadow-sm">
        <div className="max-w-[1000px] mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={handleGoHome}>
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#1877F2] to-[#1D8AF2] flex items-center justify-center shadow-[0_0_14px_rgba(24,119,242,0.25)]">
              <i className="fas fa-globe-africa text-white text-[16px]"></i>
            </div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-[#1877F2] to-[#59A7FF] text-transparent bg-clip-text">
              UNERA Terms
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
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">Terms of Service</h1>
          <p className="text-[#94A3B8]">Effective Date: February 14, 2025</p>
        </div>

        <div className="space-y-10 text-[16px] leading-relaxed text-[#D0D2D6]">
          <div className="bg-[#263951] p-5 rounded-lg border border-[#2D88FF]/30 text-sm">
            <div className="flex gap-3">
              <i className="fas fa-info-circle text-[#1877F2] text-xl flex-shrink-0 mt-0.5"></i>
              <div>
                <strong className="text-[#E4E6EB]">Important Notice:</strong> 
                <p className="mt-1 text-[#B0B3B8]">By accessing or using the UNERA Platform, you agree to be bound by these Terms. If you disagree with any part of the terms, then you may not access the Service. Please read these Terms carefully before using UNERA.</p>
              </div>
            </div>
          </div>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">1. Acceptance of Terms</h2>
            <p>By creating an account or using UNERA in any way, you agree to these Terms of Service, our Privacy Policy, and any other policies we may post. These Terms apply to all visitors, users, and others who access or use our Service ("Users").</p>
            <p className="mt-3">If you are using UNERA on behalf of a business or entity, you represent that you have the authority to bind that business or entity to these Terms.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">2. Eligibility</h2>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <i className="fas fa-user-check text-[#45BD62] mt-1"></i>
                <p>You must be at least 13 years old to use UNERA. If you are under 18, you must have a parent or guardian's consent.</p>
              </div>
              <div className="flex items-start gap-3">
                <i className="fas fa-ban text-[#E41E3F] mt-1"></i>
                <p>You must not be prohibited from receiving our services under the laws of Tanzania or any other applicable jurisdiction.</p>
              </div>
              <div className="flex items-start gap-3">
                <i className="fas fa-check-circle text-[#45BD62] mt-1"></i>
                <p>You must not have been previously removed or banned from UNERA for violation of our policies.</p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">3. Accounts</h2>
            <p>When you create an account with us, you must provide us information that is accurate, complete, and current at all times. Failure to do so constitutes a breach of the Terms, which may result in immediate termination of your account on our Service.</p>
            <p className="mt-3">You are responsible for safeguarding the password that you use to access the Service and for any activities or actions under your password, whether your password is with our Service or a third-party service. You agree not to disclose your password to any third party.</p>
            <div className="mt-4 bg-[#0F172A] p-4 rounded-lg border border-[#1E293B]">
              <h4 className="font-bold text-[#F8FAFC] mb-2">Account Responsibilities:</h4>
              <ul className="list-disc list-inside space-y-2 text-[#94A3B8] text-sm">
                <li>You must notify us immediately upon becoming aware of any breach of security or unauthorized use of your account.</li>
                <li>You may not use another user's account without permission.</li>
                <li>You are solely responsible for all activities that occur under your account.</li>
                <li>You may not create multiple accounts for deceptive or abusive purposes.</li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">4. User Content</h2>
            <p className="mb-3">Our Service allows you to post, link, store, share and otherwise make available certain information, text, graphics, videos, music, or other material ("Content"). You are responsible for the Content that you post to the Service, including its legality, reliability, and appropriateness.</p>
            
            <div className="bg-[#0F172A] p-5 rounded-lg border border-[#1E293B] mb-4">
              <h4 className="font-bold text-[#F8FAFC] mb-3 flex items-center gap-2">
                <i className="fas fa-shield-alt text-[#E41E3F]"></i>
                Prohibited Content:
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div className="flex items-start gap-2 text-[#94A3B8]">
                  <i className="fas fa-times-circle text-[#E41E3F] mt-0.5 flex-shrink-0"></i>
                  <span>Hate speech, discrimination, or harassment</span>
                </div>
                <div className="flex items-start gap-2 text-[#94A3B8]">
                  <i className="fas fa-times-circle text-[#E41E3F] mt-0.5 flex-shrink-0"></i>
                  <span>Violence, threats, or incitement to violence</span>
                </div>
                <div className="flex items-start gap-2 text-[#94A3B8]">
                  <i className="fas fa-times-circle text-[#E41E3F] mt-0.5 flex-shrink-0"></i>
                  <span>Nudity, pornography, or sexual content</span>
                </div>
                <div className="flex items-start gap-2 text-[#94A3B8]">
                  <i className="fas fa-times-circle text-[#E41E3F] mt-0.5 flex-shrink-0"></i>
                  <span>Spam, scams, or misleading information</span>
                </div>
                <div className="flex items-start gap-2 text-[#94A3B8]">
                  <i className="fas fa-times-circle text-[#E41E3F] mt-0.5 flex-shrink-0"></i>
                  <span>Illegal activities, goods, or services</span>
                </div>
                <div className="flex items-start gap-2 text-[#94A3B8]">
                  <i className="fas fa-times-circle text-[#E41E3F] mt-0.5 flex-shrink-0"></i>
                  <span>Copyright infringement or stolen content</span>
                </div>
                <div className="flex items-start gap-2 text-[#94A3B8]">
                  <i className="fas fa-times-circle text-[#E41E3F] mt-0.5 flex-shrink-0"></i>
                  <span>Malware, viruses, or harmful code</span>
                </div>
                <div className="flex items-start gap-2 text-[#94A3B8]">
                  <i className="fas fa-times-circle text-[#E41E3F] mt-0.5 flex-shrink-0"></i>
                  <span>Unauthorized commercial communications</span>
                </div>
              </div>
            </div>

            <p className="mb-3"><strong>Content License:</strong> By posting Content on UNERA, you grant us a worldwide, non-exclusive, royalty-free license to use, copy, reproduce, process, adapt, modify, publish, transmit, display, and distribute such Content on our platform. This license ends when you delete your Content or your account, except where Content has been shared with others and they have not deleted it.</p>
            
            <p><strong>Content Monitoring:</strong> We reserve the right, but have no obligation, to monitor, review, edit, or remove Content that we determine violates these Terms or is otherwise objectionable. We may also suspend or terminate accounts that repeatedly infringe intellectual property rights.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">5. Intellectual Property Rights</h2>
            <p>The Service and its original content (excluding Content provided by users), features and functionality are and will remain the exclusive property of UNERA and its licensors. The Service is protected by copyright, trademark, and other laws of both Tanzania and foreign countries.</p>
            
            <div className="mt-4 bg-[#0F172A] p-5 rounded-lg border border-[#1E293B]">
              <h4 className="font-bold text-[#F8FAFC] mb-3">Our Intellectual Property Includes:</h4>
              <ul className="space-y-2">
                <li className="flex items-start gap-2 text-[#94A3B8]">
                  <i className="fas fa-circle text-[6px] text-[#1877F2] mt-2 flex-shrink-0"></i>
                  <span>The UNERA name, logo, and brand identity</span>
                </li>
                <li className="flex items-start gap-2 text-[#B0B3B8]">
                  <i className="fas fa-circle text-[6px] text-[#1877F2] mt-2 flex-shrink-0"></i>
                  <span>Our website design, user interface, and graphics</span>
                </li>
                <li className="flex items-start gap-2 text-[#B0B3B8]">
                  <i className="fas fa-circle text-[6px] text-[#1877F2] mt-2 flex-shrink-0"></i>
                  <span>Our proprietary code, algorithms, and databases</span>
                </li>
                <li className="flex items-start gap-2 text-[#B0B3B8]">
                  <i className="fas fa-circle text-[6px] text-[#1877F2] mt-2 flex-shrink-0"></i>
                  <span>Our trademarks and trade dress may not be used without our prior written permission</span>
                </li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">6. Platform Features & Services</h2>
            <p className="mb-3">UNERA provides various features and services, each subject to specific guidelines:</p>
            <div className="space-y-4">
              <div className="bg-[#0F172A] p-4 rounded-lg border border-[#1E293B]">
                <h4 className="font-bold text-[#F8FAFC] mb-2 flex items-center gap-2">
                  <i className="fas fa-store text-[#1877F2]"></i>
                  Marketplace
                </h4>
                <p className="text-sm text-[#94A3B8]">UNERA is not a party to transactions between buyers and sellers. We do not guarantee the quality, safety, or legality of items listed. Users are responsible for complying with all applicable laws regarding their transactions.</p>
              </div>
              <div className="bg-[#0F172A] p-4 rounded-lg border border-[#1E293B]">
                <h4 className="font-bold text-[#F8FAFC] mb-2 flex items-center gap-2">
                  <i className="fas fa-music text-[#0055FF]"></i>
                  F-Music
                </h4>
                <p className="text-sm text-[#94A3B8]">Users uploading music content must own or have proper licenses for all material. Unauthorized distribution of copyrighted music is prohibited and may result in account termination.</p>
              </div>
              <div className="bg-[#0F172A] p-4 rounded-lg border border-[#1E293B]">
                <h4 className="font-bold text-[#F8FAFC] mb-2 flex items-center gap-2">
                  <i className="fas fa-calendar-alt text-[#F3425F]"></i>
                  Events
                </h4>
                <p className="text-sm text-[#94A3B8]">Event organizers are solely responsible for their events. UNERA does not endorse or verify events posted on the platform. Users attend events at their own risk.</p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">7. Third-Party Links & Services</h2>
            <p>Our Service may contain links to third-party websites or services that are not owned or controlled by UNERA.</p>
            <p className="mt-2">UNERA has no control over, and assumes no responsibility for, the content, privacy policies, or practices of any third-party websites or services. You further acknowledge and agree that UNERA shall not be responsible or liable, directly or indirectly, for any damage or loss caused or alleged to be caused by or in connection with use of or reliance on any such content, goods, or services available on or through any such websites or services.</p>
            <p className="mt-2">We strongly advise you to read the terms and conditions and privacy policies of any third-party websites or services that you visit.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">8. Termination</h2>
            <p>We may terminate or suspend your account immediately, without prior notice or liability, for any reason whatsoever, including without limitation if you breach the Terms.</p>
            <p className="mt-3">Upon termination, your right to use the Service will immediately cease. If you wish to terminate your account, you may simply discontinue using the Service or delete your account through your account settings.</p>
            <div className="mt-4 bg-[#0F172A] p-4 rounded-lg border border-[#1E293B]">
              <h4 className="font-bold text-[#F8FAFC] mb-2">Effects of Termination:</h4>
              <ul className="list-disc list-inside space-y-1 text-[#94A3B8] text-sm">
                <li>All rights granted to you under these Terms will immediately end</li>
                <li>You must cease all use of the Service</li>
                <li>We may retain your information as required by law or for legitimate business purposes</li>
                <li>Provisions that by their nature should survive termination shall survive</li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">9. Disclaimer of Warranties</h2>
            <p className="mb-3">THE SERVICE IS PROVIDED ON AN "AS IS" AND "AS AVAILABLE" BASIS. UNERA MAKES NO REPRESENTATIONS OR WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, REGARDING THE OPERATION OR AVAILABILITY OF THE SERVICE, OR THE INFORMATION, CONTENT, AND MATERIALS INCLUDED THEREIN.</p>
            <p className="text-[#B0B3B8]">To the fullest extent permitted by law, UNERA disclaims all warranties, express or implied, including but not limited to implied warranties of merchantability, fitness for a particular purpose, title, and non-infringement.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">10. Limitation of Liability</h2>
            <div className="bg-[#331E1E] p-5 rounded-lg border border-[#E41E3F]/20 mb-4">
              <p className="text-[#E4E6EB] font-semibold mb-2">IMPORTANT LIABILITY LIMITATIONS:</p>
              <p className="text-sm text-[#B0B3B8]">In no event shall UNERA, nor its directors, employees, partners, agents, suppliers, or affiliates, be liable for any indirect, incidental, special, consequential or punitive damages, including without limitation, loss of profits, data, use, goodwill, or other intangible losses, resulting from:</p>
              <ul className="mt-3 space-y-2 text-sm">
                <li className="flex items-start gap-2 text-[#B0B3B8]">
                  <i className="fas fa-chevron-right text-[#E41E3F] mt-1 flex-shrink-0"></i>
                  <span>(i) Your access to or use of or inability to access or use the Service</span>
                </li>
                <li className="flex items-start gap-2 text-[#B0B3B8]">
                  <i className="fas fa-chevron-right text-[#E41E3F] mt-1 flex-shrink-0"></i>
                  <span>(ii) Any conduct or content of any third party on the Service</span>
                </li>
                <li className="flex items-start gap-2 text-[#B0B3B8]">
                  <i className="fas fa-chevron-right text-[#E41E3F] mt-1 flex-shrink-0"></i>
                  <span>(iii) Any content obtained from the Service</span>
                </li>
                <li className="flex items-start gap-2 text-[#B0B3B8]">
                  <i className="fas fa-chevron-right text-[#E41E3F] mt-1 flex-shrink-0"></i>
                  <span>(iv) Unauthorized access, use or alteration of your transmissions or content</span>
                </li>
              </ul>
            </div>
            <p>In jurisdictions that do not allow the exclusion or limitation of liability for consequential or incidental damages, UNERA's liability shall be limited to the maximum extent permitted by law.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">11. Indemnification</h2>
            <p>You agree to defend, indemnify and hold harmless UNERA and its licensee and licensors, and their employees, contractors, agents, officers and directors, from and against any and all claims, damages, obligations, losses, liabilities, costs or debt, and expenses (including but not limited to attorney's fees), resulting from or arising out of:</p>
            <ul className="list-disc list-inside space-y-2 ml-2 mt-3 text-[#B0B3B8]">
              <li>Your use of and access to the Service</li>
              <li>Your violation of any term of these Terms</li>
              <li>Your violation of any third-party right, including without limitation any copyright, property, or privacy right</li>
              <li>Any claim that your Content caused damage to a third party</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">12. Governing Law</h2>
            <p>These Terms shall be governed and construed in accordance with the laws of Tanzania, without regard to its conflict of law provisions.</p>
            <p className="mt-2">Our failure to enforce any right or provision of these Terms will not be considered a waiver of those rights. If any provision of these Terms is held to be invalid or unenforceable by a court, the remaining provisions of these Terms will remain in effect.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">13. Changes to Terms</h2>
            <p>We reserve the right, at our sole discretion, to modify or replace these Terms at any time. If a revision is material we will try to provide at least 30 days' notice prior to any new terms taking effect. What constitutes a material change will be determined at our sole discretion.</p>
            <p className="mt-2">By continuing to access or use our Service after those revisions become effective, you agree to be bound by the revised terms. If you do not agree to the new terms, you must stop using the Service.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">14. Dispute Resolution</h2>
            <div className="space-y-3">
              <p><strong>Informal Resolution:</strong> Before filing any formal legal claim, you agree to first contact us and attempt to resolve the dispute informally. We will try to resolve the dispute by contacting you via email.</p>
              <p><strong>Arbitration:</strong> Any dispute arising from these Terms shall be resolved through binding arbitration in accordance with the laws of Tanzania.</p>
              <p><strong>Exceptions:</strong> Nothing in this section shall prevent either party from seeking injunctive or other equitable relief from the courts for matters related to data security, intellectual property, or unauthorized access to the Service.</p>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">15. Entire Agreement</h2>
            <p>These Terms constitute the entire agreement between us regarding our Service, and supersede and replace any prior agreements we might have between us regarding the Service.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">16. Contact Us</h2>
            <p>If you have any questions about these Terms, please contact us:</p>
            <div className="mt-4 p-6 bg-[#0F172A] rounded-lg border border-[#1E293B] inline-block">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <i className="fas fa-envelope text-[#1877F2] text-xl"></i>
                  <div>
                    <p className="text-[#94A3B8] text-sm">Legal Department</p>
                    <p className="text-[#F8FAFC] font-semibold">legal@unera.social</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <i className="fas fa-globe text-[#1877F2] text-xl"></i>
                  <div>
                    <p className="text-[#94A3B8] text-sm">Website</p>
                    <p className="text-[#F8FAFC] font-semibold">https://unera.social</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <i className="fas fa-file-contract text-[#1877F2] text-xl"></i>
                  <div>
                    <p className="text-[#94A3B8] text-sm">Related Documents</p>
                    <p 
                      className="text-[#1877F2] font-semibold cursor-pointer hover:underline"
                      onClick={() => navigate('/privacy')}
                    >
                      Privacy Policy
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <div className="mt-12 pt-8 border-t border-[#1E293B]">
            <div className="text-center space-y-4">
              <p className="text-[#94A3B8] text-sm">
                By using UNERA, you acknowledge that you have read, understood, and agree to be bound by these Terms of Service.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                  onClick={handleGoHome}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-[#1877F2] hover:bg-[#166FE5] text-white font-semibold rounded-full transition-colors"
                >
                  <i className="fas fa-home"></i>
                  Return to UNERA
                </button>
                <button
                  onClick={() => navigate('/privacy')}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-[#1E293B] hover:bg-[#334155] text-[#F8FAFC] font-semibold rounded-full transition-colors"
                >
                  <i className="fas fa-shield-alt"></i>
                  View Privacy Policy
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
export default TermsOfServicePage; 

