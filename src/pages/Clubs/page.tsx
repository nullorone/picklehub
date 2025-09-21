import { useState } from 'react';
import { ArrowLeft, Search, MapPin, Users, Calendar, Phone, Mail, Star, Clock } from 'lucide-react';
import {Link} from "react-router-dom";
import Navigation from "../../components/Navigation/Navigation.tsx";

interface Club {
  id: number;
  name: string;
  location: string;
  distance: string;
  members: number;
  rating: number;
  description: string;
  amenities: string[];
  contact: {
    phone?: string;
    email?: string;
    website?: string;
  };
  schedule: {
    openHours: string;
    peakHours: string;
  };
  events: {
    upcoming: number;
    thisWeek: number;
  };
  membershipFee: number;
  isJoined: boolean;
}

export default function Clubs() {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDistance, setFilterDistance] = useState<'all' | '5km' | '10km' | '25km'>('all');
  const [activeTab, setActiveTab] = useState<'browse' | 'my-clubs'>('browse');

  // Mock clubs data
  const allClubs: Club[] = [
    {
      id: 1,
      name: 'Central Pickleball Club',
      location: '123 Main Street, Downtown',
      distance: '2.3 km',
      members: 156,
      rating: 4.8,
      description: 'Premier pickleball facility with 8 indoor courts and professional coaching staff.',
      amenities: ['Indoor Courts', 'Coaching', 'Equipment Rental', 'Locker Rooms', 'Pro Shop'],
      contact: {
        phone: '(555) 123-4567',
        email: 'info@centralpickleball.com',
        website: 'centralpickleball.com'
      },
      schedule: {
        openHours: '6:00 AM - 10:00 PM',
        peakHours: '6:00 PM - 9:00 PM'
      },
      events: {
        upcoming: 3,
        thisWeek: 1
      },
      membershipFee: 89,
      isJoined: true
    },
    {
      id: 2,
      name: 'Riverside Recreation Center',
      location: '456 River Road, Riverside',
      distance: '4.7 km',
      members: 89,
      rating: 4.3,
      description: 'Community-focused club with outdoor courts and friendly atmosphere.',
      amenities: ['Outdoor Courts', 'Social Events', 'Beginner Classes', 'Parking'],
      contact: {
        phone: '(555) 987-6543',
        email: 'riverside@recreation.org'
      },
      schedule: {
        openHours: '7:00 AM - 9:00 PM',
        peakHours: '5:00 PM - 8:00 PM'
      },
      events: {
        upcoming: 2,
        thisWeek: 2
      },
      membershipFee: 45,
      isJoined: false
    },
    {
      id: 3,
      name: 'Elite Sports Complex',
      location: '789 Sports Drive, North End',
      distance: '8.1 km',
      members: 234,
      rating: 4.9,
      description: 'High-end facility with 12 courts, fitness center, and tournament hosting.',
      amenities: ['Premium Courts', 'Fitness Center', 'Tournaments', 'Cafe', 'Spa Services'],
      contact: {
        phone: '(555) 456-7890',
        email: 'elite@sportscomplex.com',
        website: 'elitesportscomplex.com'
      },
      schedule: {
        openHours: '5:00 AM - 11:00 PM',
        peakHours: '6:00 PM - 10:00 PM'
      },
      events: {
        upcoming: 5,
        thisWeek: 3
      },
      membershipFee: 149,
      isJoined: false
    }
  ];

  const myClubs = allClubs.filter(club => club.isJoined);

  const filteredClubs = allClubs.filter(club => {
    const matchesSearch = club.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         club.location.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (filterDistance === 'all') return matchesSearch;
    
    const distance = parseFloat(club.distance);
    const maxDistance = parseInt(filterDistance.replace('km', ''));
    
    return matchesSearch && distance <= maxDistance;
  });

  const renderStars = (rating: number) => {
    return Array.from({ length: 5 }, (_, i) => (
      <Star
        key={i}
        size={12}
        className={i < Math.floor(rating) ? 'text-yellow-400 fill-current' : 'text-gray-300'}
      />
    ));
  };

  return (
    <div className="p-4 max-w-md mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center space-x-3">
        <Link to="/" className="text-gray-600 dark:text-gray-400">
          <ArrowLeft size={24} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Clubs Directory
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Find and join local pickleball clubs
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
        {[
          { key: 'browse', label: 'Browse Clubs' },
          { key: 'my-clubs', label: `My Clubs (${myClubs.length})` }
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key as any)}
            className={`flex-1 py-2 px-3 text-sm font-medium rounded-md transition-colors ${
              activeTab === key
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Browse Clubs */}
      {activeTab === 'browse' && (
        <div className="space-y-4">
          {/* Search and Filter */}
          <div className="space-y-3">
            <div className="relative">
              <Search size={20} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search clubs by name or location..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              />
            </div>
            
            <div className="flex items-center space-x-2">
              <Navigation size={16} className="text-gray-500" />
              <select
                value={filterDistance}
                onChange={(e) => setFilterDistance(e.target.value as any)}
                className="flex-1 p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
              >
                <option value="all">All Distances</option>
                <option value="5km">Within 5km</option>
                <option value="10km">Within 10km</option>
                <option value="25km">Within 25km</option>
              </select>
            </div>
          </div>

          {/* Clubs List */}
          <div className="space-y-4">
            {filteredClubs.map((club) => (
              <div
                key={club.id}
                className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4 rounded-lg shadow-sm"
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-1">
                      <h3 className="font-semibold text-gray-900 dark:text-white">
                        {club.name}
                      </h3>
                      {club.isJoined && (
                        <span className="bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400 px-2 py-1 text-xs rounded-full">
                          Joined
                        </span>
                      )}
                    </div>
                    <div className="flex items-center space-x-1 mb-1">
                      {renderStars(club.rating)}
                      <span className="text-sm text-gray-600 dark:text-gray-400 ml-1">
                        {club.rating} ({club.members} members)
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-gray-900 dark:text-white">
                      ${club.membershipFee}
                    </div>
                    <div className="text-xs text-gray-500">per month</div>
                  </div>
                </div>

                <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                  {club.description}
                </p>

                <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                  <div className="flex items-center space-x-2">
                    <MapPin size={14} />
                    <span>{club.location}</span>
                    <span className="ml-auto text-blue-600 dark:text-blue-400">{club.distance}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Clock size={14} />
                    <span>Open: {club.schedule.openHours}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Calendar size={14} />
                    <span>{club.events.upcoming} upcoming events</span>
                  </div>
                </div>

                {/* Amenities */}
                <div className="mt-3">
                  <div className="flex flex-wrap gap-1">
                    {club.amenities.slice(0, 3).map((amenity, index) => (
                      <span
                        key={index}
                        className="bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 py-1 text-xs rounded"
                      >
                        {amenity}
                      </span>
                    ))}
                    {club.amenities.length > 3 && (
                      <span className="text-xs text-gray-500 px-2 py-1">
                        +{club.amenities.length - 3} more
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-600 flex space-x-2">
                  <button className="flex-1 bg-blue-600 text-white py-2 px-3 text-sm rounded-lg hover:bg-blue-700 transition-colors">
                    View Details
                  </button>
                  <button
                    className={`px-4 py-2 text-sm rounded-lg transition-colors ${
                      club.isJoined
                        ? 'bg-red-600 text-white hover:bg-red-700'
                        : 'bg-green-600 text-white hover:bg-green-700'
                    }`}
                  >
                    {club.isJoined ? 'Leave' : 'Join Club'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* My Clubs */}
      {activeTab === 'my-clubs' && (
        <div className="space-y-4">
          {myClubs.length > 0 ? (
            <div className="space-y-3">
              {myClubs.map((club) => (
                <div
                  key={club.id}
                  className="bg-white dark:bg-gray-800 border-l-4 border-blue-500 border border-gray-200 dark:border-gray-700 p-4 rounded-lg shadow-sm"
                >
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-semibold text-gray-900 dark:text-white">
                      {club.name}
                    </h3>
                    <div className="flex items-center space-x-1">
                      {renderStars(club.rating)}
                    </div>
                  </div>
                  
                  <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                    <div className="flex items-center space-x-2">
                      <MapPin size={14} />
                      <span>{club.location}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Calendar size={14} />
                      <span>{club.events.thisWeek} events this week</span>
                    </div>
                    {club.contact.phone && (
                      <div className="flex items-center space-x-2">
                        <Phone size={14} />
                        <span>{club.contact.phone}</span>
                      </div>
                    )}
                  </div>

                  <div className="mt-3 flex space-x-2">
                    <button className="flex-1 bg-blue-600 text-white py-2 px-3 text-sm rounded-lg hover:bg-blue-700 transition-colors">
                      View Events
                    </button>
                    <button className="bg-gray-600 text-white py-2 px-3 text-sm rounded-lg hover:bg-gray-700 transition-colors">
                      Contact
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-gray-50 dark:bg-gray-800 p-6 rounded-lg text-center">
              <Users size={24} className="mx-auto text-gray-400 mb-2" />
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                You haven't joined any clubs yet
              </p>
              <p className="text-gray-400 text-xs mt-1">
                Browse clubs to find your perfect playing community
              </p>
            </div>
          )}
        </div>
      )}
        <Navigation/>
    </div>
  );
}