import { useCallback, useEffect, useState } from 'react';
import { AdminDashboard } from './components/AdminDashboard';
import { AuthPortal } from './components/AuthPortal';
import { MentorDashboard } from './components/MentorDashboard';
import { PublicPortal } from './components/PublicPortal';
import { StudentDashboard } from './components/StudentDashboard';
import { apiRequest } from './lib/api';
import type {
  AuthUser,
  BrokerItem,
  CourseItem,
  EventItem,
  GalleryItem,
  LiveClassItem,
  MentorItem,
  OfferItem,
  UserRole,
} from './types/academy';

type ActiveView = 'PUBLIC' | 'AUTH' | 'DASHBOARD';

export default function App() {
  const [view, setView] = useState<ActiveView>('PUBLIC');
  const [authInitialMode, setAuthInitialMode] = useState<'LOGIN' | 'REGISTER'>('LOGIN');
  const [authRoleHint, setAuthRoleHint] = useState<UserRole>('STUDENT');

  // Session token & user stored strictly in React memory (never localStorage/sessionStorage)
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);

  const [publicData, setPublicData] = useState<{
    courses: CourseItem[];
    mentors: MentorItem[];
    offers: OfferItem[];
    events: EventItem[];
    gallery: GalleryItem[];
    brokers: BrokerItem[];
    publicClasses: LiveClassItem[];
  }>({
    courses: [],
    mentors: [],
    offers: [],
    events: [],
    gallery: [],
    brokers: [],
    publicClasses: [],
  });
  const [loadingPublic, setLoadingPublic] = useState(true);

  const fetchPublicOverview = useCallback(async () => {
    try {
      const data = await apiRequest<typeof publicData>('/api/public/overview');
      setPublicData(data);
    } catch {
      // Keep graceful state
    } finally {
      setLoadingPublic(false);
    }
  }, []);

  useEffect(() => {
    void fetchPublicOverview();
  }, [fetchPublicOverview]);

  const handleOpenAuth = (mode: 'LOGIN' | 'REGISTER' = 'LOGIN', roleHint: UserRole = 'STUDENT') => {
    setAuthInitialMode(mode);
    setAuthRoleHint(roleHint);
    setView('AUTH');
  };

  const handleAuthSuccess = (newToken: string, authedUser: AuthUser) => {
    setToken(newToken);
    setUser(authedUser);
    setView('DASHBOARD');
  };

  const handleLogout = () => {
    setToken(null);
    setUser(null);
    setView('PUBLIC');
    void fetchPublicOverview();
  };

  if (view === 'AUTH') {
    return (
      <AuthPortal
        initialMode={authInitialMode}
        initialRole={authRoleHint}
        onSuccess={handleAuthSuccess}
        onBack={() => setView('PUBLIC')}
      />
    );
  }

  if (view === 'DASHBOARD' && token && user) {
    if (user.role === 'ADMIN') {
      return (
        <AdminDashboard
          token={token}
          user={user}
          onLogout={handleLogout}
          onGoPublic={() => setView('PUBLIC')}
        />
      );
    }
    if (user.role === 'MENTOR') {
      return (
        <MentorDashboard
          token={token}
          user={user}
          onLogout={handleLogout}
          onGoPublic={() => setView('PUBLIC')}
        />
      );
    }
    return (
      <StudentDashboard
        token={token}
        user={user}
        onLogout={handleLogout}
        onGoPublic={() => setView('PUBLIC')}
      />
    );
  }

  if (loadingPublic && publicData.courses.length === 0) {
    return (
      <div className="min-h-screen bg-[#08101E] flex items-center justify-center text-sm text-slate-400">
        Loading Aurelia FX Academy...
      </div>
    );
  }

  return (
    <PublicPortal
      courses={publicData.courses}
      mentors={publicData.mentors}
      offers={publicData.offers}
      events={publicData.events}
      gallery={publicData.gallery}
      brokers={publicData.brokers}
      publicClasses={publicData.publicClasses}
      currentUser={user}
      onOpenAuth={handleOpenAuth}
      onOpenDashboard={() => setView('DASHBOARD')}
    />
  );
}
