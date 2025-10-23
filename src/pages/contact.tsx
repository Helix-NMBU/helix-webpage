import { Button } from "@components//ui/button";
import { Facebook, Instagram, Linkedin, Mail } from "lucide-react";

export default function Contact() {
    return (
      <section id="contact" className="relative py-24">
        <div className="container px-4 mx-auto">
          <div className="max-w-3xl mx-auto mb-16 text-center">
            <h2 className="mb-6 text-3xl font-bold md:text-4xl">Contact Us</h2>
            <p className="text-[#fff8e6]/80">
              Have questions or want to learn more about Helix NMBU? We'd love to hear from you!
            </p>
          </div>

          <div className="grid items-start gap-8 md:grid-cols-2">
            <div className="bg-[#040076] border border-[#a0a1da]/20 rounded-xl p-6 md:p-8">
              <form>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="name" className="block mb-1 text-sm font-medium text-foreground">
                        Name
                      </label>
                      <input
                        type="text"
                        id="name"
                        className="w-full bg-[#482ffe]/10 border border-[#a0a1da]/20 rounded-lg px-4 py-2 text-[#fff8e6] focus:outline-none focus:ring-2 focus:ring-[#67cdbc]/50"
                        placeholder="Your name"
                      />
                    </div>
                    <div>
                      <label htmlFor="email" className="block mb-1 text-sm font-medium text-foreground">
                        Email
                      </label>
                      <input
                        type="email"
                        id="email"
                        className="w-full bg-[#482ffe]/10 border border-[#a0a1da]/20 rounded-lg px-4 py-2 text-[#fff8e6] focus:outline-none focus:ring-2 focus:ring-[#67cdbc]/50"
                        placeholder="your.email@example.com"
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="subject" className="block mb-1 text-sm font-medium text-foreground">
                      Subject
                    </label>
                    <input
                      type="text"
                      id="subject"
                      className="w-full bg-[#482ffe]/10 border border-[#a0a1da]/20 rounded-lg px-4 py-2 text-[#fff8e6] focus:outline-none focus:ring-2 focus:ring-[#67cdbc]/50"
                      placeholder="How can we help?"
                    />
                  </div>
                  <div>
                    <label htmlFor="message" className="block mb-1 text-sm font-medium text-foreground">
                      Message
                    </label>
                    <textarea
                      id="message"
                      rows={11}
                      className="w-full bg-[#482ffe]/10 border border-[#a0a1da]/20 rounded-lg px-4 py-2 text-[#fff8e6] focus:outline-none focus:ring-2 focus:ring-[#67cdbc]/50"
                      placeholder="Your message..."
                    ></textarea>
                  </div>
                  <Button className="w-full bg-[#482ffe] hover:bg-[#482ffe]/80 text-[#fff8e6]">Send Message</Button>
                </div>
              </form>
            </div>

            <div className="space-y-8">
              <div className="bg-[#040076] border border-[#a0a1da]/20 rounded-xl p-6">
                <h3 className="mb-4 text-xl font-bold">Contact Information</h3>
                <div className="space-y-4">
                  <div className="flex items-start gap-4">
                    <div className="h-10 w-10 rounded-lg bg-[#482ffe]/20 flex items-center justify-center flex-shrink-0">
                      <Mail className="h-5 w-5 text-[#482ffe]" />
                    </div>
                    <div>
                      <div className="text-sm text-[#a0a1da]">Email</div>
                      <a href="mailto:contact@helixnmbu.no" className="text-[#fff8e6] hover:text-[#67cdbc]">
                        contact@helixnmbu.no
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

              <div className="bg-[#040076] border border-[#a0a1da]/20 rounded-xl p-6">
                <h3 className="mb-4 text-xl font-bold">Follow Us</h3>
                <div className="flex gap-4">
                  <a
                    href="#"
                    className="h-10 w-10 rounded-full bg-[#482ffe]/20 flex items-center justify-center hover:bg-[#482ffe]/40 transition-colors"
                  >
                    <Linkedin className="w-5 h-5" />
                  </a>
                  <a
                    href="#"
                    className="h-10 w-10 rounded-full bg-[#482ffe]/20 flex items-center justify-center hover:bg-[#482ffe]/40 transition-colors"
                  >
                    <Instagram className="w-5 h-5" />
                  </a>
                  <a
                    href="#"
                    className="h-10 w-10 rounded-full bg-[#482ffe]/20 flex items-center justify-center hover:bg-[#482ffe]/40 transition-colors"
                  >
                    <Facebook className="w-5 h-5" />
                  </a>
                </div>
              </div>

              <div className="bg-gradient-to-r from-[#482ffe]/20 to-[#67cdbc]/20 rounded-xl p-6">
                <h3 className="mb-4 text-xl font-bold">Join Our Team</h3>
                <p className="text-[#fff8e6]/80 mb-4">
                  Interested in becoming part of Helix NMBU? We're always looking for passionate students to join our
                  team!
                </p>
                <Button className="bg-[#482ffe] hover:bg-[#482ffe]/80 text-[#fff8e6]">Apply Now</Button>
              </div>
            </div>
          </div>
        </div>
      </section>
    )
}