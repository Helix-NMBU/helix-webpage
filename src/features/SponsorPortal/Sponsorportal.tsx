import { useEffect, useMemo, useState } from 'react';
import { Linkedin, Mail, User, X, Download } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../../libs/lib/utils';

const cvBucket = import.meta.env?.VITE_SUPABASE_CV_BUCKET as string | undefined;
const avatarBucket = import.meta.env?.VITE_SUPABASE_PROFILE_BUCKET as string | undefined;
const supabaseUrl = import.meta.env?.VITE_SUPABASE_URL as string | undefined;
const CURRENT_SEASON = 'S26';
const NO_SEASON_ROLE = `No ${CURRENT_SEASON} role`;
const NO_SEASON_POSITION = `No ${CURRENT_SEASON} position`;
const DEPARTMENTS = ['Autonomous', 'Marketing', 'Economics', 'Mechanical and Production', 'Electronics', 'Software', 'The Board'];

interface Member {
    id: string;
    name: string;
    fieldOfStudy: string;
    graduationYear: number;
    department: string;
    position?: string;
    linkedin: string;
    email: string;
    personalEmail?: string;
    personalPhone?: string;
    phone: string;
    profileImage?: string;
    cvUrl?: string;
}

export default function SponsorPortalPage() {
    const [members, setMembers] = useState<Member[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedMember, setSelectedMember] = useState<Member | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [supabaseError, setSupabaseError] = useState<string | null>(null);
    const [cvError, setCvError] = useState<string | null>(null);
    const [usedFallback, setUsedFallback] = useState(false);
    const [fallbackReason, setFallbackReason] = useState<string | null>(null);
    
    // Filter states
    const [selectedFieldOfStudy, setSelectedFieldOfStudy] = useState<string>('all');
    const [selectedGraduationYear, setSelectedGraduationYear] = useState<string>('all');
    const [selectedDepartment, setSelectedDepartment] = useState<string>('all');
    const [searchName, setSearchName] = useState<string>('');

    useEffect(() => {
        const loadFromStatic = async () => {
            const response = await fetch('/members.json');
            if (!response.ok) {
                throw new Error(`Fallback fetch feilet med status ${response.status}`);
            }

            const data = await response.json();
            const mapped: Member[] = (data ?? []).map((row: any) => {
                const department = row.department ?? NO_SEASON_ROLE;
                const position = row.title ?? row.position ?? NO_SEASON_POSITION;
                return {
                    id: String(row.id),
                    name: row.name,
                    fieldOfStudy: row.fieldOfStudy,
                    graduationYear: row.graduation_year ?? row.graduationYear ?? row.yearOfStudy ?? 'alumni',
                    department,
                    position,
                    linkedin: row.linkedin ?? '',
                    email: row.email ?? '',
                    personalEmail: row.personalEmail ?? undefined,
                    personalPhone: row.personalPhone ?? undefined,
                    phone: row.phone ?? '',
                    profileImage: row.profileImage ?? undefined,
                    cvUrl: row.cvUrl ?? undefined,
                };
            });
            setUsedFallback(true);
            setFallbackReason(prev => prev ?? 'Supabase utilgjengelig eller feilet; bruker lokal members.json');
            setMembers(mapped);
        };

        // Extract storage path from public/signed URLs (removes /object/, bucket prefix, leading slashes)
        const extractStoragePath = (urlString: string, bucket?: string) => {
            let candidate = urlString;
            try {
                const url = new URL(urlString);
                const idx = url.pathname.indexOf('/object/');
                if (idx >= 0) {
                    candidate = decodeURIComponent(url.pathname.slice(idx + '/object/'.length));
                }
            } catch {
                /* ignore non-URL strings */
            }
            candidate = candidate.replace(/^\/+/, '');
            if (bucket) {
                const bucketPrefix = `${bucket}/`;
                const publicBucketPrefix = `public/${bucket}/`;
                if (candidate.startsWith(publicBucketPrefix)) {
                    candidate = candidate.slice(publicBucketPrefix.length);
                } else if (candidate.startsWith(bucketPrefix)) {
                    candidate = candidate.slice(bucketPrefix.length);
                }
            }
            return candidate;
        };

        const isSupabaseStorageUrl = (urlString: string) => {
            if (!urlString.startsWith('http')) return false;
            if (!supabaseUrl) return urlString.includes('/storage/v1/object/');
            try {
                const base = new URL(supabaseUrl);
                const target = new URL(urlString);
                return target.host === base.host && target.pathname.includes('/storage/v1/object/');
            } catch {
                return urlString.includes('/storage/v1/object/');
            }
        };

        // Resolve cvUrl paths stored in Supabase to signed URLs for viewing/downloading
        const resolveCvUrls = async (list: Member[]) => {
            const needsSigning = list.some(m => m.cvUrl && !m.cvUrl.startsWith('http'));
            if (!supabase || !cvBucket) {
                if (needsSigning) {
                    console.warn('CV bucket missing or Supabase not configured; cannot sign CV URLs.');
                }
                return list;
            }

            const rawPaths = list
                .map(m => m.cvUrl)
                .filter((url): url is string => typeof url === 'string' && url.length > 0)
                .map(path => {
                    if (!path.startsWith('http')) return extractStoragePath(path, cvBucket);
                    return isSupabaseStorageUrl(path) ? extractStoragePath(path, cvBucket) : path;
                })
                .filter(path => !path.startsWith('http'));

            const uniquePaths = Array.from(new Set(rawPaths));
            if (!uniquePaths.length) return list;

            const { data: signedUrls, error: signError } = await supabase.storage
                .from(cvBucket)
                .createSignedUrls(uniquePaths, 60 * 60 * 6);

            if (signError) {
                console.error('Failed to sign CV URLs:', signError);
                setSupabaseError(prev => prev ?? `Kunne ikke signere CV-URLer: ${signError.message ?? signError}`);
                return list;
            }

            const map = new Map<string, string>();
            signedUrls?.forEach((item, idx) => {
                const path = uniquePaths[idx];
                if (item?.signedUrl) {
                    map.set(path, item.signedUrl);
                }
            });

            return list.map(member => {
                if (!member.cvUrl) return member;
                if (member.cvUrl.startsWith('http') && !isSupabaseStorageUrl(member.cvUrl)) return member;
                const storagePath = extractStoragePath(member.cvUrl, cvBucket);
                const signed = map.get(storagePath);
                if (signed) return { ...member, cvUrl: signed };
                // fallback to public URL if bucket is public
                if (supabase) {
                    const { data: publicData } = supabase.storage.from(cvBucket).getPublicUrl(storagePath);
                    return publicData?.publicUrl ? { ...member, cvUrl: publicData.publicUrl } : member;
                }
                return member;
            });
        };

        // Resolve profile images to signed URLs if stored as paths
        const resolveProfileImages = async (list: Member[]) => {
            const needsSigning = list.some(m => m.profileImage && !m.profileImage.startsWith('http'));
            if (!supabase || !avatarBucket) {
                if (needsSigning) {
                    console.warn('Avatar bucket missing or Supabase not configured; cannot sign profile images.');
                }
                return list;
            }

            const rawPaths = list
                .map(m => m.profileImage)
                .filter((url): url is string => typeof url === 'string' && url.length > 0)
                .map(path => {
                    if (!path.startsWith('http')) return extractStoragePath(path, avatarBucket);
                    return isSupabaseStorageUrl(path) ? extractStoragePath(path, avatarBucket) : path;
                })
                .filter(path => !path.startsWith('http'));

            const uniquePaths = Array.from(new Set(rawPaths));
            if (!uniquePaths.length) return list;

            const { data: signedUrls, error: signError } = await supabase.storage
                .from(avatarBucket)
                .createSignedUrls(uniquePaths, 60 * 60 * 6);

            if (signError) {
                console.error('Failed to sign profile images:', signError);
                setSupabaseError(prev => prev ?? `Kunne ikke signere profilbilder: ${signError.message ?? signError}`);
                return list;
            }

            const map = new Map<string, string>();
            signedUrls?.forEach((item, idx) => {
                const path = uniquePaths[idx];
                if (item?.signedUrl) {
                    map.set(path, item.signedUrl);
                }
            });

            return list.map(member => {
                if (!member.profileImage) return member;
                if (member.profileImage.startsWith('http') && !isSupabaseStorageUrl(member.profileImage)) return member;
                const storagePath = extractStoragePath(member.profileImage, avatarBucket);
                const signed = map.get(storagePath);
                if (signed) return { ...member, profileImage: signed };
                if (supabase) {
                    const { data: publicData } = supabase.storage.from(avatarBucket).getPublicUrl(storagePath);
                    return publicData?.publicUrl ? { ...member, profileImage: publicData.publicUrl } : member;
                }
                return member;
            });
        };

        const loadMembers = async () => {
            try {
                setError(null);
                setSupabaseError(null);
                setLoading(true);

                if (!supabase) {
                    setFallbackReason('Supabase-klient ikke konfigurert (mangler eller ugyldige VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).');
                    setSupabaseError('Supabase-klient ikke konfigurert (mangler eller ugyldige VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).');
                    await loadFromStatic();
                    return;
                }

                const { data, error: supaError } = await supabase
                    .from('students')
                    .select('*')
                    .order('full_name', { ascending: true });

                if (supaError) throw supaError;

                // Fetch department + title for current season positions (schema: student_id, title, department_id)
                const { data: positions, error: posError } = await supabase
                    .from('positions')
                    .select('student_id, season, title, department_id, departments(name)')
                    .eq('season', CURRENT_SEASON);
                if (posError) throw posError;

                const deptByStudent = new Map<string, string>();
                const positionByStudent = new Map<string, string>();
                (positions ?? []).forEach((row: any) => {
                    const deptName = row?.departments?.name as string | undefined;
                    if (deptName) {
                        deptByStudent.set(String(row.student_id), deptName);
                    }
                    const positionTitle = row?.title as string | undefined;
                    if (positionTitle) {
                        positionByStudent.set(String(row.student_id), positionTitle);
                    }
                });

                const mappedRaw: Member[] = (data ?? []).map((row: any) => {
                    const studentId = String(row.id);
                    const seasonDept = deptByStudent.get(studentId);
                    const department = seasonDept ?? NO_SEASON_ROLE;
                    const seasonPosition = positionByStudent.get(studentId);
                    const position = seasonPosition ?? NO_SEASON_POSITION;
                    return {
                        id: studentId,
                        name: row.full_name ?? row.name ?? 'Ukjent navn',
                        fieldOfStudy: row.field_of_study ?? row.fieldOfStudy ?? 'Ukjent studieretning',
                        graduationYear: row.graduation_year ?? row.year_of_study ?? 'alumni',
                        department,
                        position,
                        linkedin: row.linkedin ?? '',
                        email: row.email ?? '',
                        personalEmail: row.personal_email ?? undefined,
                        personalPhone: row.personal_phone ?? undefined,
                        phone: row.phone ?? '',
                        profileImage: row.profile_image_url ?? row.profileImage ?? undefined,
                        cvUrl: row.cv_url ?? row.cvUrl ?? undefined,
                    };
                });

                const withAvatars = await resolveProfileImages(mappedRaw);
                const mapped = await resolveCvUrls(withAvatars);
                setUsedFallback(false);
                setFallbackReason(null);
                setMembers(mapped);
            } catch (err) {
                console.error('Error loading members:', err);
                const message =
                    err instanceof Error
                        ? err.message
                        : typeof err === 'object' && err !== null && 'message' in err
                          ? String((err as any).message)
                          : 'Kunne ikke laste medlemmer.';

                setSupabaseError(message);

                // Try fallback to static data when Supabase fails
                try {
                    setFallbackReason(message);
                    await loadFromStatic();
                } catch (fallbackErr) {
                    console.error('Fallback load failed:', fallbackErr);
                    const fallbackMessage =
                        fallbackErr instanceof Error
                            ? fallbackErr.message
                            : 'Kunne ikke laste medlemmer.';
                    setError(`Kunne ikke laste medlemmer. Supabase: ${message}. Fallback: ${fallbackMessage}`);
                }
            } finally {
                setLoading(false);
            }
        };

        loadMembers();
    }, []);

    // Get unique values for filters (memoized for larger datasets)
    const uniqueFieldsOfStudy = useMemo(
        () => Array.from(new Set(members.map(m => m.fieldOfStudy))),
        [members]
    );
    const uniqueGraduationYears = useMemo(
        () => Array.from(new Set(members.map(m => m.graduationYear).filter(y => typeof y === 'number'))).sort((a, b) => a - b),
        [members]
    );
    const uniqueDepartments = useMemo(() => {
        const existing = Array.from(new Set(members.map(m => m.department).filter(Boolean)));
        const base = [...DEPARTMENTS];
        existing.forEach(dept => {
            if (!base.includes(dept)) {
                base.push(dept);
            }
        });
        return base;
    }, [members]);

    // Filter members based on selected filters (memoized to avoid re-computation)
    const filteredMembers = useMemo(() => members.filter(member => {
        if (selectedFieldOfStudy !== 'all' && member.fieldOfStudy !== selectedFieldOfStudy) return false;
        if (selectedGraduationYear !== 'all' && member.graduationYear?.toString() !== selectedGraduationYear) return false;
        if (selectedDepartment !== 'all' && member.department !== selectedDepartment) return false;
        if (searchName && !member.name.toLowerCase().includes(searchName.toLowerCase())) return false;
        return true;
    }), [members, selectedDepartment, selectedFieldOfStudy, selectedGraduationYear, searchName]);

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
        return <div className="justify-center">Laster...</div>;
    }

    if (error) {
        return <div className="p-8 text-red-200">{error}</div>;
    }

    return (
        <>
            <Link to="/" className="fixed top-0 left-0 z-50">
                    <div className="absolute z-10 p-4 border-2 cursor-pointer border-white/60 rounded-2xl top-10 left-10 hover:border-accent">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white transition-colors duration-200 ">
                            <path d="M15 18l-6-6 6-6" />
                        </svg>
                    </div>
            </Link>
            <div className="px-6 py-16 text-white pt-36 min-h-svh bg-menu-background">
                {/* Main Layout: Sidebar + Content */}
                <div className="flex flex-col gap-6 md:flex-row">
                    {/* Left Sidebar - Filters */}
                    <div className="flex-shrink-0 w-full md:w-72">
                        <div className="sticky p-4 space-y-4 border shadow-lg top-36 rounded-2xl border-white/10 bg-white/5 backdrop-blur">
                            <h2 className="mb-2 text-lg font-semibold text-white">Filtrer</h2>
                            
                            {/* Search Input */}
                            <div className="mb-4">
                                <label className="block mb-2 text-sm font-medium text-white/80">Søk etter navn</label>
                                <input
                                    type="text"
                                    placeholder="Skriv inn navn..."
                                    value={searchName}
                                    onChange={(e) => setSearchName(e.target.value)}
                                    className="w-full p-2 text-white border rounded-md border-white/20 bg-white/10 placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-accent"
                                />
                            </div>
        
                            {/* Field of Study Filter */}
                            <div className="mb-4">
                                <label className="block mb-2 text-sm font-medium text-white/80">Studierettning</label>
                                <select
                                    value={selectedFieldOfStudy}
                                    onChange={(e) => setSelectedFieldOfStudy(e.target.value)}
                                    className="w-full p-2 text-white border rounded-md cursor-pointer border-white/20 bg-white/10"
                                >
                                    <option value="all">Vis alle</option>
                                    {uniqueFieldsOfStudy.map(field => (
                                        <option key={field} value={field}>{field}</option>
                                    ))}
                                </select>
                            </div>
                                
                            {/* Year of Study Filter */}
                            <div className="mb-4">
                                <label className="block mb-2 text-sm font-medium text-white/80">Avgangsår</label>
                                <select
                                    value={selectedGraduationYear}
                                    onChange={(e) => setSelectedGraduationYear(e.target.value)}
                                    className="w-full p-2 text-white border rounded-md cursor-pointer border-white/20 bg-white/10"
                                >
                                    <option value="all">Vis alle</option>
                                    {uniqueGraduationYears.map(year => (
                                        <option key={year} value={year.toString()}>{year}</option>
                                    ))}
                                </select>
                            </div>
                                
                            {/* Department Filter */}
                            <div className="mb-4">
                                <label className="block mb-2 text-sm font-medium text-white/80">S26 Avdeling</label>
                                <select
                                    value={selectedDepartment}
                                    onChange={(e) => setSelectedDepartment(e.target.value)}
                                    className="w-full p-2 text-white border rounded-md cursor-pointer border-white/20 bg-white/10"
                                >
                                    <option value="all">Vis alle</option>
                                    {uniqueDepartments.map(dept => (
                                        <option key={dept} value={dept}>{dept}</option>
                                    ))}
                                </select>
                            </div>
                                
                            {/* Results count */}
                            <div className="pt-4 mt-4 text-sm border-t text-white/70 border-white/10">
                                Viser {filteredMembers.length} av {members.length} medlemmer
                                {usedFallback && (
                                    <p className="mt-2 text-xs text-amber-200">
                                        Bruker fallback-data fra members.json (Supabase utilgjengelig). {fallbackReason ?? ''}
                                    </p>
                                )}
                                {supabaseError && !usedFallback && (
                                    <p className="mt-2 text-xs text-amber-200">
                                        Supabase-feil: {supabaseError}
                                    </p>
                                )}
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
                                        onClick={(e) => {
                                            // Prevent card click when an inner control (contact buttons) is clicked
                                            if ((e.target as HTMLElement).closest('a')) return;
                                            setCvError(null);
                                            setSelectedMember(member);
                                        }}
                                        className="relative p-5 overflow-hidden transition-all border shadow-xl cursor-pointer rounded-2xl border-white/10 bg-white/5 backdrop-blur hover:-translate-y-1 hover:shadow-2xl hover:border-accent"
                                    >
                                        <div className="absolute w-20 h-20 rounded-full pointer-events-none -left-10 -top-10 bg-accent/30 blur-3xl" />
                                        <div className="absolute w-20 h-20 rounded-full pointer-events-none -right-10 -bottom-10 bg-primary/20 blur-3xl" />

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
                                        
                                        <h2 className="relative z-10 text-xl font-semibold text-center text-white">{member.name}</h2>
                                        {/* Contact Icons */}
                                        <div className="relative z-10 flex justify-center gap-3 mt-4">
                                            <a 
                                                href={member.linkedin} 
                                                target="_blank" 
                                                rel="noopener noreferrer"
                                                className="p-2 transition-colors rounded-md hover:bg-white/10"
                                                title="LinkedIn"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <Linkedin className="w-5 h-5 text-white" />
                                            </a>
                                            <a 
                                                href={`mailto:${member.personalEmail || member.email}`}
                                                className="p-2 transition-colors rounded-md hover:bg-white/10"
                                                title="Email"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <Mail className="w-5 h-5 text-white" />
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
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
                        onClick={() => setSelectedMember(null)}
                    >
                        <div 
                            className="relative w-full max-w-4xl max-h-[120vh] overflow-y-auto m-4 border rounded-lg bg-card border-border"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Modal Header */}
                            <div className="sticky top-0 z-10 flex items-center justify-end gap-3 p-6 border-b bg-white/5 border-white/10">
                                {selectedMember.cvUrl && (
                                    <button
                                        onClick={() => handleDownloadCV(selectedMember)}
                                        className="flex items-center gap-2 px-4 py-2 text-white transition-colors border rounded-md cursor-pointer border-white/30 hover:bg-white/10"
                                    >
                                        <Download className="w-4 h-4" />
                                        Last ned CV
                                    </button>
                                )}
                                <button
                                    onClick={() => setSelectedMember(null)}
                                    className="p-2 transition-colors rounded-md hover:bg-grey/10"
                                    aria-label="Close modal"
                                >
                                    <X className="w-6 h-6 text-black cursor-pointer" />
                                </button>
                            </div>
                            
                                {/* CV Section */}
                                {selectedMember.cvUrl && !cvError ? (
                                    <div className="p-6">
                                        <div className="overflow-hidden border rounded-lg border-white/10">
                                            <iframe
                                                key={selectedMember.cvUrl}
                                                src={selectedMember.cvUrl}
                                                className="w-full h-[85vh] bg-white"
                                                title={`CV for ${selectedMember.name}`}
                                                loading="lazy"
                                                onError={() => setCvError('Medlem har ikke CV tilgjengelig for øyeblikket')}
                                            />
                                        </div>
                                    </div>
                                ) : (
                                    <div className="p-6 text-center border rounded-lg border-white/10 bg-white/5">
                                        <p className="text-center text-black">{cvError ?? 'Medlem har ikke CV tilgjengelig for øyeblikket'}</p>
                                    </div>
                                )}
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}