import { H1 } from '@libs/text/h1'
import { Paragraph } from '@libs/text/paragraph'

export const HeroSection = () => {
  return (
    <section className="bg-primary text-foreground">
      <H1>Welcome to Helix NMBU</H1>
      <Paragraph className='text-center'>Your journey to excellence starts here.</Paragraph>
      <button className="cta-button">Get Started</button>
    </section>
  );
}