import { useMemo, useState } from "react";
import emailjs from "@emailjs/browser";
import { Button } from "@components//ui/button";

type FormStatus =
  | { state: "idle" }
  | { state: "success"; message: string }
  | { state: "error"; message: string };

export const ContactForm: React.FC = () => {
    const [formValues, setFormValues] = useState({
      name: "",
      email: "",
      subject: "",
      message: "",
    });
    const [status, setStatus] = useState<FormStatus>({ state: "idle" });
    const [isSubmitting, setIsSubmitting] = useState(false);

    const emailConfig = useMemo(() => {
      const serviceId = import.meta.env.VITE_EMAILJS_SERVICE_ID;
      const templateId = import.meta.env.VITE_EMAILJS_TEMPLATE_ID;
      const publicKey = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;
      const toEmail = import.meta.env.VITE_CONTACT_TO_EMAIL;
      const fromEmail = import.meta.env.VITE_EMAILJS_FROM_EMAIL || "no-reply@helixnmbu.no";

      return { serviceId, templateId, publicKey, toEmail, fromEmail };
    }, []);

    const handleChange = (
      event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
    ) => {
      const { name, value } = event.target;
      setFormValues((prev) => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (isSubmitting) {
        return;
      }

      const { name, email, subject, message } = formValues;

      if (!name || !email || !subject || !message) {
        setStatus({ state: "error", message: "Please fill in every field before sending." });
        return;
      }

      if (!emailConfig.serviceId || !emailConfig.templateId || !emailConfig.publicKey) {
        setStatus({
          state: "error",
          message:
            "Email service credentials are missing. Please configure VITE_EMAILJS_SERVICE_ID, VITE_EMAILJS_TEMPLATE_ID, and VITE_EMAILJS_PUBLIC_KEY.",
        });
        return;
      }

      if (!emailConfig.toEmail) {
        setStatus({
          state: "error",
          message:
            "Missing recipient address. Please set VITE_CONTACT_TO_EMAIL to your inbox.",
        });
        return;
      }

      setIsSubmitting(true);
      setStatus({ state: "idle" });

      try {
        const subjectWithSender = `${subject} — from ${name} <${email}>`;
        await emailjs.send(
          emailConfig.serviceId,
          emailConfig.templateId,
          {
            from_name: name,
            // Use a neutral from_email (domain you control) to avoid providers rewriting it; reply_to remains the user's email
            from_email: emailConfig.fromEmail,
            reply_to: email,
            user_email: email,
            to_email: emailConfig.toEmail,
            subject,
            subject_with_sender: subjectWithSender,
            sender_name: name,
            sender_email: email,
            message,
          },
          emailConfig.publicKey
        );

        setStatus({ state: "success", message: "Message sent! We'll get back to you shortly." });
        setFormValues({ name: "", email: "", subject: "", message: "" });
      } catch (error) {
        console.error("Failed to send contact form", error);
        setStatus({
          state: "error",
          message: "Something went wrong while sending your message. Please try again in a moment.",
        });
      } finally {
        setIsSubmitting(false);
      }
    };

    return (
        <form onSubmit={handleSubmit} noValidate>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="name" className="block mb-1 text-sm font-medium text-foreground">
                    Name
                  </label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    className="w-full bg-[#482ffe]/10 border border-[#a0a1da]/20 rounded-lg px-4 py-2 text-[#fff8e6] focus:outline-none focus:ring-2 focus:ring-[#67cdbc]/50"
                    placeholder="Your name"
                    value={formValues.name}
                    onChange={handleChange}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="email" className="block mb-1 text-sm font-medium text-foreground">
                    Email
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    className="w-full bg-[#482ffe]/10 border border-[#a0a1da]/20 rounded-lg px-4 py-2 text-[#fff8e6] focus:outline-none focus:ring-2 focus:ring-[#67cdbc]/50"
                    placeholder="your.email@example.com"
                    value={formValues.email}
                    onChange={handleChange}
                    required
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
                  name="subject"
                  className="w-full bg-[#482ffe]/10 border border-[#a0a1da]/20 rounded-lg px-4 py-2 text-[#fff8e6] focus:outline-none focus:ring-2 focus:ring-[#67cdbc]/50"
                  placeholder="How can we help?"
                  value={formValues.subject}
                  onChange={handleChange}
                  required
                />
              </div>
              <div>
                <label htmlFor="message" className="block mb-1 text-sm font-medium text-foreground">
                  Message
                </label>
                <textarea
                  id="message"
                  name="message"
                  rows={11}
                  className="w-full bg-[#482ffe]/10 border border-[#a0a1da]/20 rounded-lg px-4 py-2 text-[#fff8e6] focus:outline-none focus:ring-2 focus:ring-[#67cdbc]/50"
                  placeholder="Your message..."
                  value={formValues.message}
                  onChange={handleChange}
                  required
                ></textarea>
              </div>
              <Button
                type="submit"
                className="w-full bg-[#482ffe] hover:bg-[#482ffe]/80 text-[#fff8e6] cursor-pointer"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Sending..." : "Send Message"}
              </Button>

              {status.state !== "idle" && (
                <p
                  className={`text-sm ${
                    status.state === "success"
                      ? "text-emerald-400"
                      : "text-red-400"
                  }`}
                >
                  {status.message}
                </p>
              )}
            </div>
        </form>

    )
}