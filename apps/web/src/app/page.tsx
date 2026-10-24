import { Navbar } from "@/components/Navbar";
import { Hero } from "@/components/Hero";
import { Simulator } from "@/components/Simulator";
import { Features } from "@/components/Features";
import { HowItWorks } from "@/components/HowItWorks";
import { Faq } from "@/components/Faq";
import { Footer } from "@/components/Footer";

export default function Home() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <Simulator />
        <Features />
        <HowItWorks />
        <Faq />
      </main>
      <Footer />
    </>
  );
}
