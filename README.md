Forslag til filstruktur:

src/
├── libs/                         # Shared across all features
│   ├── components/
│   │   ├── ui/                     # Design system
│   │   │   ├── Button/
│   │   │   ├── Card/
│   │   │   ├── Modal/
│   │   │   ├── Tabs/
│   │   │   ├── Badge/
│   │   │   └── LoadingSpinner/
│   │   ├── layout/                 # Site layout
│   │   │   ├── Header/
│   │   │   ├── Footer/
│   │   │   ├── Navigation/
│   │   │   └── PageLayout/
│   │   ├── media/                  # Media components
│   │   │   ├── ImageGallery/
│   │   │   ├── VideoPlayer/
│   │   │   └── FileDownload/
│   │   └── forms/                  # Form components
│   │       ├── ContactForm/
│   │       └── FormField/
│   ├── hooks/
│   │   ├── useApi.ts
│   │   ├── useLocalStorage.ts
│   │   ├── useIntersectionObserver.ts
│   │   └── useScrollTo.ts
│   ├── services/
│   │   ├── api/
│   │   │   ├── client.ts
│   │   │   └── types.ts
│   │   ├── analytics.ts
│   │   └── storage.ts
│   ├── utils/
│   │   ├── formatters.ts
│   │   ├── validators.ts
│   │   ├── constants.ts
│   │   └── helpers.ts
│   ├── types/
│   │   ├── common.ts
│   │   ├── api.ts
│   │   └── navigation.ts
│   └── styles/
│       ├── globals.css
│       ├── variables.css
│       └── animations.css
├── features/
│   ├── home/                       # Landing page features
│   │   ├── components/
│   │   │   ├── HeroSection/
│   │   │   ├── AchievementStats/
│   │   │   ├── TeamHighlights/
│   │   │   ├── CallToAction/
│   │   │   └── NewsPreview/
│   │   ├── hooks/
│   │   │   └── useHomeData.ts
│   │   ├── services/
│   │   │   └── homeApi.ts
│   │   └── index.ts
│   ├── team/                       # Team management & display
│   │   ├── components/
│   │   │   ├── TeamGrid/
│   │   │   ├── MemberCard/
│   │   │   ├── MemberProfile/
│   │   │   ├── DepartmentFilter/
│   │   │   ├── TeamStructure/
│   │   │   └── RecruitmentBanner/
│   │   ├── hooks/
│   │   │   ├── useTeamMembers.ts
│   │   │   ├── useMemberProfile.ts
│   │   │   └── useRecruitment.ts
│   │   ├── services/
│   │   │   ├── teamApi.ts
│   │   │   └── recruitmentApi.ts
│   │   ├── store/
│   │   │   └── teamSlice.ts
│   │   ├── types/
│   │   │   ├── member.types.ts
│   │   │   └── department.types.ts
│   │   └── index.ts
│   ├── cars/                       # Vehicle showcase
│   │   ├── components/
│   │   │   ├── CarShowcase/
│   │   │   ├── CarTimeline/
│   │   │   ├── TechnicalSpecs/
│   │   │   ├── PerformanceStats/
│   │   │   ├── CarGallery/
│   │   │   └── ComparisonTable/
│   │   ├── hooks/
│   │   │   ├── useCars.ts
│   │   │   └── useCarDetails.ts
│   │   ├── services/
│   │   │   └── carsApi.ts
│   │   ├── types/
│   │   │   ├── car.types.ts
│   │   │   └── specs.types.ts
│   │   └── index.ts
│   ├── technical/                  # Technical systems showcase
│   │   ├── components/
│   │   │   ├── SystemOverview/
│   │   │   ├── TechnicalCard/
│   │   │   ├── InnovationHighlight/
│   │   │   ├── DevelopmentProcess/
│   │   │   └── TechSpecs/
│   │   ├── hooks/
│   │   │   └── useTechnical.ts
│   │   ├── services/
│   │   │   └── technicalApi.ts
│   │   ├── types/
│   │   │   └── technical.types.ts
│   │   └── index.ts
│   ├── achievements/               # Competition results & awards
│   │   ├── components/
│   │   │   ├── AchievementsList/
│   │   │   ├── CompetitionResult/
│   │   │   ├── AwardBadge/
│   │   │   ├── ResultsTimeline/
│   │   │   └── StatsDisplay/
│   │   ├── hooks/
│   │   │   └── useAchievements.ts
│   │   ├── services/
│   │   │   └── achievementsApi.ts
│   │   ├── types/
│   │   │   └── achievements.types.ts
│   │   └── index.ts
│   ├── sponsors/                   # Sponsor management
│   │   ├── components/
│   │   │   ├── SponsorGrid/
│   │   │   ├── SponsorCard/
│   │   │   ├── SponsorshipTiers/
│   │   │   ├── SponsorProfile/
│   │   │   ├── PartnershipForm/
│   │   │   └── SponsorPortal/
│   │   ├── hooks/
│   │   │   ├── useSponsors.ts
│   │   │   └── useSponsorPortal.ts
│   │   ├── services/
│   │   │   ├── sponsorsApi.ts
│   │   │   └── sponsorPortalApi.ts
│   │   ├── types/
│   │   │   ├── sponsor.types.ts
│   │   │   └── partnership.types.ts
│   │   └── index.ts
│   ├── theses/                     # Academic projects
│   │   ├── components/
│   │   │   ├── ThesesList/
│   │   │   ├── ThesisCard/
│   │   │   ├── ThesisDetails/
│   │   │   ├── CategoryFilter/
│   │   │   └── ThesisSubmission/
│   │   ├── hooks/
│   │   │   ├── useTheses.ts
│   │   │   └── useThesisSubmission.ts
│   │   ├── services/
│   │   │   └── thesesApi.ts
│   │   ├── types/
│   │   │   └── thesis.types.ts
│   │   └── index.ts
│   ├── media/                      # Blog, videos, images
│   │   ├── components/
│   │   │   ├── blog/
│   │   │   │   ├── BlogList/
│   │   │   │   ├── BlogPost/
│   │   │   │   └── BlogEditor/
│   │   │   ├── videos/
│   │   │   │   ├── VideoGallery/
│   │   │   │   ├── VideoPlayer/
│   │   │   │   └── VideoUpload/
│   │   │   └── gallery/
│   │   │       ├── PhotoGallery/
│   │   │       ├── ImageViewer/
│   │   │       └── ImageUpload/
│   │   ├── hooks/
│   │   │   ├── useBlog.ts
│   │   │   ├── useVideos.ts
│   │   │   └── useGallery.ts
│   │   ├── services/
│   │   │   ├── blogApi.ts
│   │   │   ├── videoApi.ts
│   │   │   └── mediaApi.ts
│   │   ├── types/
│   │   │   ├── blog.types.ts
│   │   │   ├── media.types.ts
│   │   │   └── video.types.ts
│   │   └── index.ts
│   ├── events/                     # Events & competitions
│   │   ├── components/
│   │   │   ├── EventCalendar/
│   │   │   ├── EventCard/
│   │   │   ├── CompetitionSchedule/
│   │   │   ├── EventRegistration/
│   │   │   └── HelixDagen/
│   │   ├── hooks/
│   │   │   ├── useEvents.ts
│   │   │   └── useEventRegistration.ts
│   │   ├── services/
│   │   │   └── eventsApi.ts
│   │   ├── types/
│   │   │   └── events.types.ts
│   │   └── index.ts
│   └── recruitment/                # Join us & applications
│       ├── components/
│       │   ├── ApplicationForm/
│       │   ├── PositionList/
│       │   ├── RequirementsList/
│       │   ├── ProcessTimeline/
│       │   └── TestimonialCards/
│       ├── hooks/
│       │   ├── useApplications.ts
│       │   └── usePositions.ts
│       ├── services/
│       │   └── recruitmentApi.ts
│       ├── types/
│       │   ├── application.types.ts
│       │   └── position.types.ts
│       └── index.ts
├── pages/                          # Route pages
│   ├── HomePage/
│   ├── AboutPage/
│   ├── TeamPage/
│   ├── CarsPage/
│   ├── SponsorsPage/
│   ├── ThesesPage/
│   ├── BlogPage/
│   ├── VideosPage/
│   ├── SponsorPortalPage/
│   ├── JoinUsPage/
│   └── ContactPage/
├── app/                           # App configuration
│   ├── router/
│   │   ├── routes.tsx
│   │   ├── publicRoutes.ts
│   │   └── protectedRoutes.ts
│   ├── providers/
│   │   ├── AppProvider.tsx
│   │   ├── AuthProvider.tsx
│   │   └── ThemeProvider.tsx
│   └── config/
│       ├── env.ts
│       ├── navigation.ts
│       └── seo.ts
├── assets/                        # Static assets
│   ├── images/
│   │   ├── cars/
│   │   ├── team/
│   │   ├── sponsors/
│   │   ├── achievements/
│   │   └── brand/
│   ├── videos/
│   ├── documents/                 # PDFs, specs, etc.
│   └── icons/
└── styles/
    ├── globals.css
    ├── components.css
    └── tailwind.css