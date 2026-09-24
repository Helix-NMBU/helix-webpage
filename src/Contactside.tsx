import { useState } from "react";
import supabase from "./libs/lib/utils";

type ContactForm = {
  name: string;
  email: string;
  subject: string;
  message: string;
};





export default function Contactside() {
  const [form, setForm] = useState<ContactForm>({
    name: "",
    email: "",
    subject: "",
    message: "",
  });

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) {
    setForm((currentForm) => ({
      ...currentForm,
      [e.target.name]: e.target.value,
    }));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
  e.preventDefault();

  if (!supabase) {
    console.error("Supabase er ikke konfigurert");
    return;
  }

  // 1. Lagre i databasen
const { error } = await supabase
  .from("kontakt skjema")
  .insert({
    Name: form.name,
    Subject: form.subject,
    Email: form.email,
    Message: form.message,
  });
  if (error) {
    console.error("Kunne ikke lagre kontaktskjemaet:", error);
    return;
  }

  // 2. Send e-post
  const { error: emailError } = await supabase.functions.invoke(
    "email-sender-function",
    {
      body: {
        name: form.name,
        email: form.email,
        subject: form.subject,
        message: form.message,
      },
    }
  );

  if (emailError) {
    console.error("Kunne ikke sende e-post:", emailError);
    return;
  }

  // 3. Alt gikk bra
  console.log("Kontaktskjema sendt:", form);

  setForm({
    name: "",
    email: "",
    subject: "",
    message: "",
  });
}
	return (
    <main className="contact-layout" style= {{ 
      background: "#f6f7fb", 
      color: "#0b1b4d", 
      minHeight: "100vh", 
      padding: "120px 80px 80px",
      display: "flex",
      alignItems: "flex-start",
      gap: "80px" }}> 
      <div className="contact-copy" style= {{
        flex: 1,
        maxWidth: "50%",
        margin: 20,
      }}>
    <div style= {{
      fontSize: "50px",
      letterSpacing: "0.18em",
      textTransform: "uppercase",
      color: "#0b58dc",
      marginBottom: "10px",
      marginTop: "25px"
    }}>
      Contact us
    </div>
    <div style= {{
      fontSize: "10px",
      margin: 0,
      lineHeight: 0.9,
      fontWeight: 700,
      color: "#0b1b4d"
    }}>
      If you have any questions about Helix, get in touch.
    </div>
	    </div>
      <form
        className="contact-form"
        onSubmit={handleSubmit}
        style={{
          width: "50%",
          maxWidth: "570px",
          marginLeft: "auto",
          marginTop: "50px"
        }}
      >
      <div style={{
       display: "flex",
       flexDirection: "column",
       gap: "16px"
      }}>
       <input 
      name ="name" 
       type = "text"
       placeholder = "Navn"
      value = {form.name}
      onChange = {handleChange}
       style = {{
        flex: 1,
        minWidth: 0,
        padding: "18px 18px",
        border: "1px solid rgba(11, 27, 77, 0.3)",
        borderRadius: "12px",
        background: "#fff",
        fontSize: "1rem",
        color: "#0b1b4d",
        outline: "none",
       }}
       
       />
       <input 
      name ="subject"
      type = "text"
      placeholder = "Emne"
      value = {form.subject}
      onChange = {handleChange}
       style = {{
         flex: 1,
        minWidth: 0,
        padding: "18px 18px",
        border: "1px solid rgba(11, 27, 77, 0.3)",
        borderRadius: "12px",
        background: "#fff",
        fontSize: "1rem",
        color: "#0b1b4d",
        outline: "none",
       }}
       />
       <input 
      name ="email" 
      type = "email"
       placeholder = "Email"
       value = {form.email}
       onChange = {handleChange}
       style = {{
       flex: 1,
      minWidth: 0,
      padding: "18px 18px",
      border: "1px solid rgba(11, 27, 77, 0.3)",
      borderRadius: "12px",
      background: "#fff",
      fontSize: "1rem",
      color: "#0b1b4d",
      outline: "none"
       }}
    
       /></div>
       <textarea 
      name ="message" 
       placeholder = "Message"
      value = {form.message}
      onChange = {handleChange}
       style = {{
        width: "100%",
        minHeight: "170px",
        marginTop: "20px",
        padding: "18px 18px",
        border: "1px solid rgba(11, 27, 77, 0.3)",
        borderRadius: "12px",
        background: "#fff",
        fontSize: "1rem",
        color: "#0b1b4d",
        resize: "vertical",
        outline: "none",
       }}
       />


       <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="submit"
                  style={{
                    padding: "14px 28px",
                    borderRadius: "12px",
                    border: "1px solid #0b1b4d",
                    background: "#0b1b4d",
                    color: "#fff",
                    fontSize: "0.9rem",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    cursor: "pointer",
                  }}
                > 
                  Send
                </button>
              </div>
      </form>
    </main>
  );
}

console.log("name\nEmne\nEmail\nMessage")