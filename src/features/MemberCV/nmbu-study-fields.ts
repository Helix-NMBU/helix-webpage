import type { SearchableOption } from "@libs/components/ui/searchable-select";

// NMBU public programme catalogue, checked 2026-10-25. Includes every entry
// in the Norwegian catalogue, not only programmes taught in English.
// https://www.nmbu.no/studier
// https://www.nmbu.no/api/search/all/study_program?q=&locale=nb
// https://www.nmbu.no/api/search/all/study_program?q=&locale=en
// Use catalogue English titles where present; otherwise translate the display
// name. Collapse identical fields across degree levels; retain Norwegian search aliases.
export const nmbuStudyFields: SearchableOption[] = [
  {
    "value": "Agronomy - Animal Science",
    "label": "Agronomy - Animal Science",
    "keywords": [
      "Sivilagronom husdyr"
    ]
  },
  {
    "value": "Agronomy - Plant Sciences",
    "label": "Agronomy - Plant Sciences",
    "keywords": [
      "Sivilagronom plantevitenskap"
    ]
  },
  {
    "value": "Animal Science",
    "label": "Animal Science",
    "keywords": [
      "Husdyrvitenskap"
    ]
  },
  {
    "value": "Applied Economics and Sustainability",
    "label": "Applied Economics and Sustainability",
    "keywords": [
      "Samfunnsøkonomi og bærekraft"
    ]
  },
  {
    "value": "Applied Robotics",
    "label": "Applied Robotics",
    "keywords": [
      "Anvendt robotikk"
    ]
  },
  {
    "value": "Aquaculture",
    "label": "Aquaculture",
    "keywords": [
      "Akvakultur"
    ]
  },
  {
    "value": "Bioeconomy - Biobased Value Creation and Business Development",
    "label": "Bioeconomy - Biobased Value Creation and Business Development",
    "keywords": [
      "Bioøkonomi - Biobasert verdiskaping og forretningsutvikling"
    ]
  },
  {
    "value": "Bioinformatics and Applied Statistics",
    "label": "Bioinformatics and Applied Statistics",
    "keywords": [
      "Bioinformatikk og anvendt statistikk"
    ]
  },
  {
    "value": "Biology",
    "label": "Biology",
    "keywords": [
      "Biologi"
    ]
  },
  {
    "value": "Biosciences",
    "label": "Biosciences",
    "keywords": [
      "Biovitenskap"
    ]
  },
  {
    "value": "Biotechnology",
    "label": "Biotechnology",
    "keywords": [
      "Bioteknologi"
    ]
  },
  {
    "value": "Building Technology and Architecture",
    "label": "Building Technology and Architecture",
    "keywords": [
      "Byggeteknikk og arkitektur"
    ]
  },
  {
    "value": "Business Administration",
    "label": "Business Administration",
    "keywords": [
      "Økonomi og administrasjon"
    ]
  },
  {
    "value": "Business Administration - Master",
    "label": "Business Administration - Master",
    "keywords": [
      "Økonomi og administrasjon - siviløkonom"
    ]
  },
  {
    "value": "Business Administration with Informatics",
    "label": "Business Administration with Informatics",
    "keywords": [
      "Økonomi, ledelse og IT"
    ]
  },
  {
    "value": "Chemistry",
    "label": "Chemistry",
    "keywords": [
      "Kjemi"
    ]
  },
  {
    "value": "Chemistry and Biotechnology",
    "label": "Chemistry and Biotechnology",
    "keywords": [
      "Kjemi og bioteknologi"
    ]
  },
  {
    "value": "Continuing Education",
    "label": "Continuing Education",
    "keywords": [
      "Etter og videreutdanning"
    ]
  },
  {
    "value": "Data Science",
    "label": "Data Science",
    "keywords": [
      "Datavitenskap"
    ]
  },
  {
    "value": "Ecology",
    "label": "Ecology",
    "keywords": [
      "Økologi"
    ]
  },
  {
    "value": "Ecology and Natural Resource Management",
    "label": "Ecology and Natural Resource Management",
    "keywords": [
      "Økologi og naturforvaltning"
    ]
  },
  {
    "value": "Economics",
    "label": "Economics",
    "keywords": [
      "Samfunnsøkonomi"
    ]
  },
  {
    "value": "Economics and Business",
    "label": "Economics and Business",
    "keywords": [
      "Økonomi og administrasjon"
    ]
  },
  {
    "value": "Economics and Environmental Governance",
    "label": "Economics and Environmental Governance",
    "keywords": [
      "Samfunnsøkonomi og miljøforvaltning"
    ]
  },
  {
    "value": "Energy and Environmental Physics",
    "label": "Energy and Environmental Physics",
    "keywords": [
      "Energi- og miljøfysikk"
    ]
  },
  {
    "value": "Entrepreneurship and Innovation",
    "label": "Entrepreneurship and Innovation",
    "keywords": [
      "Entreprenørskap og innovasjon"
    ]
  },
  {
    "value": "Environment and Natural Resources",
    "label": "Environment and Natural Resources",
    "keywords": [
      "Miljø og naturressurser"
    ]
  },
  {
    "value": "Environmental Physics and Renewable Energy",
    "label": "Environmental Physics and Renewable Energy",
    "keywords": [
      "Miljøfysikk og fornybar energi"
    ]
  },
  {
    "value": "Environmental Sciences",
    "label": "Environmental Sciences",
    "keywords": [
      "Miljøvitenskap"
    ]
  },
  {
    "value": "Environmental Sciences and Natural Resource Management",
    "label": "Environmental Sciences and Natural Resource Management",
    "keywords": [
      "Miljøvitenskap og naturforvaltning"
    ]
  },
  {
    "value": "European Master in Animal Biodiversity and Genomics",
    "label": "European Master in Animal Biodiversity and Genomics",
    "keywords": []
  },
  {
    "value": "Food Science and Nutrition",
    "label": "Food Science and Nutrition",
    "keywords": [
      "Matvitenskap og ernæring"
    ]
  },
  {
    "value": "Food, Technology and Health",
    "label": "Food, Technology and Health",
    "keywords": [
      "Mat, teknologi og helse"
    ]
  },
  {
    "value": "Forest Sciences",
    "label": "Forest Sciences",
    "keywords": [
      "Skogfag"
    ]
  },
  {
    "value": "Genome Sciences",
    "label": "Genome Sciences",
    "keywords": [
      "Genomvitenskap"
    ]
  },
  {
    "value": "Geoinformatics",
    "label": "Geoinformatics",
    "keywords": [
      "Geoinformatikk"
    ]
  },
  {
    "value": "Geomatics",
    "label": "Geomatics",
    "keywords": [
      "Geomatikk"
    ]
  },
  {
    "value": "Global Development Studies",
    "label": "Global Development Studies",
    "keywords": [
      "Globale utviklingsstudier"
    ]
  },
  {
    "value": "Global Economy and Politics",
    "label": "Global Economy and Politics",
    "keywords": [
      "Global økonomi og politikk"
    ]
  },
  {
    "value": "Individual Courses",
    "label": "Individual Courses",
    "keywords": [
      "Studere enkeltemner"
    ]
  },
  {
    "value": "Industrial Economics",
    "label": "Industrial Economics",
    "keywords": [
      "Industriell økonomi",
      "Indøk",
      "indok",
      "industrial economy"
    ]
  },
  {
    "value": "Intelligent Water Technology",
    "label": "Intelligent Water Technology",
    "keywords": []
  },
  {
    "value": "International Environment and Development Studies",
    "label": "International Environment and Development Studies",
    "keywords": [
      "Internasjonale miljø- og utviklingsstudier"
    ]
  },
  {
    "value": "International Environmental Studies",
    "label": "International Environmental Studies",
    "keywords": [
      "Internasjonale miljøstudier"
    ]
  },
  {
    "value": "International Relations",
    "label": "International Relations",
    "keywords": [
      "Internasjonale relasjoner"
    ]
  },
  {
    "value": "International Relations - part time",
    "label": "International Relations - part time",
    "keywords": [
      "Internasjonale relasjoner - deltid"
    ]
  },
  {
    "value": "Landscape Architecture",
    "label": "Landscape Architecture",
    "keywords": [
      "Landskapsarkitektur"
    ]
  },
  {
    "value": "Landscape Architecture for Global Sustainability",
    "label": "Landscape Architecture for Global Sustainability",
    "keywords": [
      "Landskapsarkitektur for global bærekraft"
    ]
  },
  {
    "value": "Landscape Engineering",
    "label": "Landscape Engineering",
    "keywords": [
      "Landskapsingeniør"
    ]
  },
  {
    "value": "Life and Food Sciences",
    "label": "Life and Food Sciences",
    "keywords": [
      "Natur- og matvitenskap"
    ]
  },
  {
    "value": "Master with Practical Pedagogical Education",
    "label": "Master with Practical Pedagogical Education",
    "keywords": [
      "Master med praktisk-pedagogisk utdanning"
    ]
  },
  {
    "value": "Natural Resource Management",
    "label": "Natural Resource Management",
    "keywords": [
      "Naturforvaltning"
    ]
  },
  {
    "value": "Nature-based Tourism and Visitor Management",
    "label": "Nature-based Tourism and Visitor Management",
    "keywords": [
      "Naturbasert reiseliv og besøksforvaltning"
    ]
  },
  {
    "value": "Nordic Master in Aquatic Food Production - Safety and Quality",
    "label": "Nordic Master in Aquatic Food Production - Safety and Quality",
    "keywords": []
  },
  {
    "value": "Nuclear and Environmental Sciences",
    "label": "Nuclear and Environmental Sciences",
    "keywords": [
      "Nukleær- og miljøvitenskap"
    ]
  },
  {
    "value": "One-year Foundation Studies",
    "label": "One-year Foundation Studies",
    "keywords": [
      "Ettårig grunnstudium"
    ]
  },
  {
    "value": "One-year Studies in Nature and Environment",
    "label": "One-year Studies in Nature and Environment",
    "keywords": [
      "Årsstudium i natur og miljø"
    ]
  },
  {
    "value": "Plant Sciences",
    "label": "Plant Sciences",
    "keywords": [
      "Plantevitenskap"
    ]
  },
  {
    "value": "Practical Pedagogical Education",
    "label": "Practical Pedagogical Education",
    "keywords": [
      "Praktisk-pedagogisk utdanning"
    ]
  },
  {
    "value": "Public Health",
    "label": "Public Health",
    "keywords": [
      "Folkehelsevitenskap"
    ]
  },
  {
    "value": "Public Health - Part-time",
    "label": "Public Health - Part-time",
    "keywords": [
      "Folkehelsevitenskap - deltid"
    ]
  },
  {
    "value": "Radioactivity and Environment",
    "label": "Radioactivity and Environment",
    "keywords": [
      "Radioaktivitet og miljø"
    ]
  },
  {
    "value": "Real Estate",
    "label": "Real Estate",
    "keywords": [
      "Eiendom"
    ]
  },
  {
    "value": "Real Estate Development",
    "label": "Real Estate Development",
    "keywords": [
      "Eiendomsutvikling"
    ]
  },
  {
    "value": "Real Estate Development - Part-time",
    "label": "Real Estate Development - Part-time",
    "keywords": [
      "Eiendomsutvikling - deltid"
    ]
  },
  {
    "value": "Renewable Energy",
    "label": "Renewable Energy",
    "keywords": [
      "Fornybar energi"
    ]
  },
  {
    "value": "Science",
    "label": "Science",
    "keywords": [
      "Frie realfag"
    ]
  },
  {
    "value": "Science and Technology",
    "label": "Science and Technology",
    "keywords": [
      "Realfag og teknologi"
    ]
  },
  {
    "value": "Society, development and planning",
    "label": "Society, development and planning",
    "keywords": [
      "Samfunnsutvikling og planlegging"
    ]
  },
  {
    "value": "State-authorised Accounting",
    "label": "State-authorised Accounting",
    "keywords": [
      "Statsautorisert regnskapsfører"
    ]
  },
  {
    "value": "Sustainable Economics and Management",
    "label": "Sustainable Economics and Management",
    "keywords": [
      "Bærekraftig økonomi og ledelse"
    ]
  },
  {
    "value": "Sustainable Food Systems",
    "label": "Sustainable Food Systems",
    "keywords": [
      "Bærekraftige matsystemer"
    ]
  },
  {
    "value": "Teacher Education in Natural Sciences",
    "label": "Teacher Education in Natural Sciences",
    "keywords": [
      "Lektorutdanning i realfag - LUR"
    ]
  },
  {
    "value": "Technology and Product Development",
    "label": "Technology and Product Development",
    "keywords": [
      "Teknologi og produktutvikling",
      "Mechanical engineering",
      "Maskin-, prosess- og produktutvikling"
    ]
  },
  {
    "value": "Urban and Regional Planning",
    "label": "Urban and Regional Planning",
    "keywords": [
      "By- og regionplanlegging"
    ]
  },
  {
    "value": "Veterinary Medicine",
    "label": "Veterinary Medicine",
    "keywords": [
      "Veterinærmedisin - Profesjonsstudium"
    ]
  },
  {
    "value": "Veterinary Nursing",
    "label": "Veterinary Nursing",
    "keywords": [
      "Dyrepleie"
    ]
  },
  {
    "value": "Veterinary Science",
    "label": "Veterinary Science",
    "keywords": [
      "Veterinærvitenskap"
    ]
  },
  {
    "value": "Water and Environmental Engineering",
    "label": "Water and Environmental Engineering",
    "keywords": [
      "Vann- og miljøteknikk"
    ]
  }
];

export function nmbuStudyFieldLabel(value: string): string {
  const normalized = value.trim().toLocaleLowerCase("en");
  return nmbuStudyFields.find((field) => [field.value, ...(field.keywords ?? [])]
    .some((name) => name.toLocaleLowerCase("en") === normalized))?.label ?? value;
}
