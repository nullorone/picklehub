import { Home, Trophy, Play, Building2, User } from 'lucide-react';
import {Link, useLocation} from "react-router-dom";

const Navigation = () => {
  const pathname = useLocation().pathname;

  const navItems = [
    { href: '/', label: 'Main', icon: Home },
    { href: '/tournament', label: 'Tournament', icon: Trophy },
    { href: '/game', label: 'Game', icon: Play },
    { href: '/clubs', label: 'Clubs', icon: Building2 },
    { href: '/profile', label: 'Profile', icon: User },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white dark:bg-black border-t border-gray-200 dark:border-gray-800 px-4 py-2">
      <div className="flex justify-around items-center max-w-md mx-auto">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              to={href}
              className={`flex flex-col items-center space-y-1 px-3 py-2 rounded-lg transition-colors ${
                isActive
                  ? 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/20'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              <Icon size={20} />
              <span className="text-xs font-medium">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};

export default Navigation;
