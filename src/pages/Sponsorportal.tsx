import { useEffect, useState } from 'react';
import { Linkedin, Mail, Phone, User, X, Download } from 'lucide-react';

interface Member {
    id: number;
    name: string;
    fieldOfStudy: string;
    yearOfStudy: number | 'alumni';
    department: string;
    seasonsInHelix: number;
    linkedin: string;
    email: string;
    phone: string;
    profileImage?: string;
    cvUrl?: string;
}

export default function SponsorPortalPage() {
    const [members, setMembers] = useState<Member[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedMember, setSelectedMember] = useState<Member | null>(null);
    
    // Filter states
    const [selectedFieldOfStudy, setSelectedFieldOfStudy] = useState<string>('all');
    const [selectedYearOfStudy, setSelectedYearOfStudy] = useState<string>('all');
    const [selectedDepartment, setSelectedDepartment] = useState<string>('all');
    const [selectedYearsOfExperience, setSelectedYearsOfExperience] = useState<string>('all');
    const [searchName, setSearchName] = useState<string>('');

    useEffect(() => {
        fetch('/members.json')
            .then(response => response.json())
            .then(data => {
                setMembers(data);
                setLoading(false);
            })
            .catch(error => {
                console.error('Error loading members:', error);
                setLoading(false);
            });
    }, []);

    // Get unique values for filters
    const uniqueFieldsOfStudy = Array.from(new Set(members.map(m => m.fieldOfStudy)));
    const uniqueYearsOfStudy = Array.from(new Set(members.map(m => m.yearOfStudy).filter(y => typeof y === 'number'))).sort((a, b) => a - b);
    const uniqueDepartments = Array.from(new Set(members.map(m => m.department)));
    const uniqueSeasonsInHelix = Array.from(new Set(members.map(m => m.seasonsInHelix))).sort((a, b) => a - b);

    // Filter members based on selected filters
    const filteredMembers = members.filter(member => {
        if (selectedFieldOfStudy !== 'all' && member.fieldOfStudy !== selectedFieldOfStudy) return false;
        if (selectedYearOfStudy !== 'all' && member.yearOfStudy.toString() !== selectedYearOfStudy) return false;
        if (selectedDepartment !== 'all' && member.department !== selectedDepartment) return false;
        if (selectedYearsOfExperience !== 'all' && member.seasonsInHelix.toString() !== selectedYearsOfExperience) return false;
        if (searchName && !member.name.toLowerCase().includes(searchName.toLowerCase())) return false;
        return true;
    });

    const handleDownloadCV = (member: Member) => {
        if (member.cvUrl) {
            const link = document.createElement('a');
            link.href = member.cvUrl;
            link.download = `${member.name.replace(/\s+/g, '_')}_CV.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    };

    if (loading) {
        return <div className="p-8">Loading members...</div>;
    }

    return (
        <div className="p-8">
            <h1 className="mb-6 text-3xl font-bold">Helix CV-Bank</h1>
            
            {/* Main Layout: Sidebar + Content */}
            <div className="flex gap-6">
                {/* Left Sidebar - Filters */}
                <div className="flex-shrink-0 w-72">
                    <div className="sticky p-4 border rounded-lg top-8 bg-card border-border">
                        <h2 className="mb-4 text-lg font-semibold text-primary">Filtrer</h2>
                        
                        {/* Search Input */}
                        <div className="mb-4">
                            <label className="block mb-2 text-sm font-medium text-primary">Søk etter navn</label>
                            <input
                                type="text"
                                placeholder="Skriv inn navn..."
                                value={searchName}
                                onChange={(e) => setSearchName(e.target.value)}
                                className="w-full p-2 border rounded-md border-border bg-secondary text-primary placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                            />
                        </div>

                        {/* Field of Study Filter */}
                        <div className="mb-4">
                            <label className="block mb-2 text-sm font-medium text-primary">Studierettning</label>
                            <select
                                value={selectedFieldOfStudy}
                                onChange={(e) => setSelectedFieldOfStudy(e.target.value)}
                                className="w-full p-2 border rounded-md cursor-pointer border-border bg-secondary text-primary"
                            >
                                <option value="all">Vis alle</option>
                                {uniqueFieldsOfStudy.map(field => (
                                    <option key={field} value={field}>{field}</option>
                                ))}
                            </select>
                        </div>

                        {/* Year of Study Filter */}
                        <div className="mb-4">
                            <label className="block mb-2 text-sm font-medium text-primary">Årstrinn</label>
                            <select
                                value={selectedYearOfStudy}
                                onChange={(e) => setSelectedYearOfStudy(e.target.value)}
                                className="w-full p-2 border rounded-md cursor-pointer border-border bg-secondary text-primary"
                            >
                                <option value="all">Vis alle</option>
                                {uniqueYearsOfStudy.map(year => (
                                    <option key={year} value={year.toString()}>{year}.året</option>
                                ))}
                                <option value="alumni">Alumni</option>
                            </select>
                        </div>

                        {/* Department Filter */}
                        <div className="mb-4">
                            <label className="block mb-2 text-sm font-medium text-primary">Avdeling</label>
                            <select
                                value={selectedDepartment}
                                onChange={(e) => setSelectedDepartment(e.target.value)}
                                className="w-full p-2 border rounded-md cursor-pointer border-border bg-secondary text-primary"
                            >
                                <option value="all">Vis alle</option>
                                {uniqueDepartments.map(dept => (
                                    <option key={dept} value={dept}>{dept}</option>
                                ))}
                            </select>
                        </div>

                        {/* Seasons in Helix Filter */}
                        <div className="mb-4">
                            <label className="block mb-2 text-sm font-medium text-primary">Sesonger i Helix</label>
                            <select
                                value={selectedYearsOfExperience}
                                onChange={(e) => setSelectedYearsOfExperience(e.target.value)}
                                className="w-full p-2 border rounded-md cursor-pointer border-border bg-secondary text-primary"
                            >
                                <option value="all">Vis alle</option>
                                {uniqueSeasonsInHelix.map(seasons => (
                                    <option key={seasons} value={seasons.toString()}>{seasons} {seasons === 1 ? 'sesong' : 'sesonger'}</option>
                                ))}
                            </select>
                        </div>

                        {/* Results count */}
                        <div className="pt-4 mt-4 text-sm border-t text-primary border-border">
                            Viser {filteredMembers.length} av {members.length} medlemmer
                        </div>
                    </div>
                </div>

                {/* Right Content - Members Grid */}
                <div className="flex-1">
                    {filteredMembers.length > 0 ? (
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                            {filteredMembers.map(member => (
                                <div 
                                    key={member.id} 
                                    onClick={() => setSelectedMember(member)}
                                    className="p-4 transition-shadow border rounded-lg cursor-pointer border-border bg-card hover:shadow-lg hover:border-accent"
                                >
                                    {/* Profile Picture */}
                                    <div className="flex justify-center mb-4">
                                        {member.profileImage ? (
                                            <img 
                                                src={member.profileImage} 
                                                alt={member.name}
                                                className="object-cover w-24 h-24 border-2 rounded-full border-primary"
                                            />
                                        ) : (
                                            <div className="flex items-center justify-center w-24 h-24 border-2 rounded-full bg-secondary border-primary">
                                                <User className="w-12 h-12 text-primary" />
                                            </div>
                                        )}
                                    </div>
                                    
                                    <h2 className="text-xl font-semibold text-center text-primary">{member.name}</h2>
                                    <p className="mt-2 text-center text-muted-foreground">
                                        <span className="font-medium">Avdeling:</span> {member.department}
                                    </p>
                                    
                                    {/* Contact Icons */}
                                    <div className="flex justify-center gap-3 mt-4">
                                        <a 
                                            href={member.linkedin} 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            className="p-2 transition-colors rounded-md hover:bg-secondary"
                                            title="LinkedIn"
                                        >
                                            <Linkedin className="w-5 h-5 text-primary" />
                                        </a>
                                        <a 
                                            href={`mailto:${member.email}`}
                                            className="p-2 transition-colors rounded-md hover:bg-secondary"
                                            title="Email"
                                        >
                                            <Mail className="w-5 h-5 text-primary" />
                                        </a>
                                        <a 
                                            href={`tel:${member.phone}`}
                                            className="p-2 transition-colors rounded-md hover:bg-secondary"
                                            title="Phone"
                                        >
                                            <Phone className="w-5 h-5 text-primary" />
                                        </a>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="py-12 text-center text-foreground">
                            Ingen medlemmer funnet med valgte filtre.
                        </div>
                    )}
                </div>
            </div>

            {/* Modal for CV Display */}
            {selectedMember && (
                <div 
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
                    onClick={() => setSelectedMember(null)}
                >
                    <div 
                        className="relative w-full max-w-4xl max-h-[120vh] overflow-y-auto m-4 border rounded-lg bg-card border-border"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Modal Header */}
                        <div className="sticky top-0 z-10 flex items-center justify-end gap-3 p-6 border-b bg-card border-border">
                            {selectedMember.cvUrl && (
                                <button
                                    onClick={() => handleDownloadCV(selectedMember)}
                                    className="flex items-center gap-2 px-4 py-2 transition-colors border rounded-md cursor-pointer border-primary text-primary hover:bg-primary hover:text-foreground"
                                >
                                    <Download className="w-4 h-4" />
                                    Last ned CV
                                </button>
                            )}
                            <button
                                onClick={() => setSelectedMember(null)}
                                className="p-2 transition-colors rounded-md hover:bg-secondary"
                                aria-label="Close modal"
                            >
                                <X className="w-6 h-6 cursor-pointer text-primary" />
                            </button>
                        </div>

                            {/* CV Section */}
                            {selectedMember.cvUrl ? (
                                <div className="p-6">
                                    <div className="overflow-hidden border rounded-lg border-border">
                                        <iframe
                                            src={selectedMember.cvUrl}
                                            className="w-full h-[85vh] bg-white"
                                            title={`CV for ${selectedMember.name}`}
                                        />
                                    </div>
                                </div>
                            ) : (
                                <div className="p-6 text-center border rounded-lg border-border bg-secondary">
                                    <p className="text-muted-foreground">CV er ikke tilgjengelig for dette medlemmet.</p>
                                </div>
                            )}
                    </div>
                </div>
            )}
        </div>
    );
}