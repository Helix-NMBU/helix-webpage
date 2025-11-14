import { Button } from "@components//ui/button";
import { Facebook, Instagram, Linkedin, Mail } from "lucide-react";
import { ContactForm } from "./ContactForm";

export default function Contact() {
  const application_url = import.meta.env.VITE_FORMS_URL;
    return (
      <section id="contact" className="relative py-24">
        <div className="container px-4 mx-auto">
          <div className="max-w-3xl mx-auto mb-16 text-center opacity-0 translate-y-8 animate-[fadeInUp_0.8s_ease-out_0.1s_forwards]">
            <h2 className="mb-6 text-3xl font-bold md:text-4xl">Contact Us</h2>
            <p className="text-accent">
              Have questions or want to learn more about Helix NMBU? We'd love to hear from you!
            </p>
          </div>

          <div className="grid items-start gap-8 md:grid-cols-2">
            <div className="bg-[#040076] border border-[#a0a1da]/20 rounded-xl p-6 md:p-8 opacity-0 translate-y-8 animate-[fadeInUp_0.8s_ease-out_0.2s_forwards]">
              <ContactForm />
            </div>

            <div className="space-y-8">
              <div className="bg-[#040076] border border-[#a0a1da]/20 rounded-xl p-6 opacity-0 translate-y-8 animate-[fadeInUp_0.8s_ease-out_0.3s_forwards]">
                <h3 className="mb-4 text-xl font-bold">Contact Information</h3>
                <div className="space-y-4">
                  <div className="flex items-start gap-4">
                    <div className="h-10 w-10 rounded-lg bg-[#482ffe]/20 flex items-center justify-center flex-shrink-0">
                      <Mail className="h-5 w-5 text-[#482ffe]" />
                    </div>
                    <div>
                      <div className="text-sm text-[#a0a1da]">Email</div>
                      <a href="mailto:post@helixnmbu.no" className="text-[#fff8e6] hover:text-[#67cdbc]">
                        post@helixnmbu.no
                      </a>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="h-10 w-10 rounded-lg bg-[#482ffe]/20 flex items-center justify-center flex-shrink-0">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-5 w-5 text-[#482ffe]"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                      </svg>
                    </div>
                    <div>
                      <div className="text-sm text-[#a0a1da]">Location</div>
                      <div className="text-[#fff8e6]">Norwegian University of Life Sciences, Ås, Norway</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-[#040076] border border-[#a0a1da]/20 rounded-xl p-6 opacity-0 translate-y-8 animate-[fadeInUp_0.8s_ease-out_0.4s_forwards]">
                <h3 className="mb-4 text-xl font-bold">Follow Us</h3>
                <div className="flex gap-4">
                  <a
                    href="https://www.linkedin.com/company/helix-nmbu"
                    className="h-10 w-10 rounded-full bg-[#482ffe]/20 flex items-center justify-center hover:bg-[#482ffe]/40 transition-colors"
                  >
                    <Linkedin className="w-5 h-5" />
                  </a>
                  <a
                    href="https://instagram.com/helixnmbu"
                    className="h-10 w-10 rounded-full bg-[#482ffe]/20 flex items-center justify-center hover:bg-[#482ffe]/40 transition-colors"
                  >
                    <Instagram className="w-5 h-5" />
                  </a>
                  <a
                    href="https://www.facebook.com/profile.php?id=100091245669131"
                    className="h-10 w-10 rounded-full bg-[#482ffe]/20 flex items-center justify-center hover:bg-[#482ffe]/40 transition-colors"
                  >
                    <Facebook className="w-5 h-5" />
                  </a>
                </div>
              </div>

              <div className="bg-gradient-to-r from-[#482ffe]/20 to-[#67cdbc]/20 rounded-xl p-6 opacity-0 translate-y-8 animate-[fadeInUp_0.8s_ease-out_0.5s_forwards]">
                <h3 className="mb-4 text-xl font-bold">Join Our Team</h3>
                <p className="text-[#fff8e6]/80 mb-4">
                  Interested in becoming part of Helix NMBU? We're always looking for passionate students to join our
                  team!
                </p>
                <Button 
                  className="bg-[#482ffe] hover:bg-[#482ffe]/80 text-[#fff8e6]"
                  asChild
                >
                  <a href={application_url}>Apply Now</a>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>
    )
}