
import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faChartLine,
  faEye,
  faMousePointer,
  faDollarSign,
  faPlay,
  faCalendar,
  faArrowUp,
  faArrowDown
} from '@fortawesome/free-solid-svg-icons';
import { AdCampaign } from '../types';

interface DashboardProps {
  campaigns: AdCampaign[];
  loading?: boolean;
}

export default function Dashboard({ campaigns }: DashboardProps) {
  // Calculate totals
  const totalImpressions = campaigns.reduce((sum, ad) => sum + (ad.analytics?.impressions ?? ad.impressions ?? 0), 0);
  const totalClicks = campaigns.reduce((sum, ad) => sum + (ad.analytics?.clicks ?? ad.clicks ?? 0), 0);
  const totalViews = campaigns.reduce((sum, ad) => sum + (ad.analytics?.views ?? ad.views ?? 0), 0);
  const totalSpend = campaigns.reduce((sum, ad) => sum + (ad.analytics?.spend ?? ad.spent ?? 0), 0);
  
  const activeCampaigns = campaigns.filter(ad => ad.status === 'active').length;
  const ctr = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) : '0.00';
  
  // Mock data for charts (in real app, fetch from API)
  const weeklyData = [
    { day: 'Mon', impressions: 1200, clicks: 45 },
    { day: 'Tue', impressions: 1350, clicks: 52 },
    { day: 'Wed', impressions: 1100, clicks: 38 },
    { day: 'Thu', impressions: 1800, clicks: 72 },
    { day: 'Fri', impressions: 2100, clicks: 88 },
    { day: 'Sat', impressions: 1900, clicks: 76 },
    { day: 'Sun', impressions: 1600, clicks: 61 },
  ];

  const StatCard = ({ title, value, icon, trend, trendValue, color }: any) => (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 hover:border-zinc-700 transition-all group">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-zinc-500 font-medium mb-1">{title}</p>
          <p className="text-3xl font-bold text-white">{value}</p>
          {trend && (
            <div className="flex items-center gap-1 mt-2">
              {trend === 'up' ? (
                <FontAwesomeIcon icon={faArrowUp} className="w-4 h-4 text-emerald-500" />
              ) : (
                <FontAwesomeIcon icon={faArrowDown} className="w-4 h-4 text-red-500" />
              )}
              <span className={trend === 'up' ? 'text-emerald-500' : 'text-red-500'}>
                {trendValue}
              </span>
              <span className="text-zinc-500 text-sm">vs last week</span>
            </div>
          )}
        </div>
        <div className={`w-12 h-12 rounded-xl bg-${color}-500/10 flex items-center justify-center group-hover:scale-110 transition-transform`}>
          <FontAwesomeIcon icon={icon} className={`w-6 h-6 text-${color}-500`} />
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div>
        <h2 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Ad Analytics</h2>
        <p className="text-zinc-400 mt-1">Track your campaign performance and analytics.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Impressions"
          value={totalImpressions.toLocaleString()}
          icon={faEye}
          trend="up"
          trendValue="12.5%"
          color="blue"
        />
        <StatCard
          title="Total Clicks"
          value={totalClicks.toLocaleString()}
          icon={faMousePointer}
          trend="up"
          trendValue="8.2%"
          color="emerald"
        />
        <StatCard
          title="Total Views"
          value={totalViews.toLocaleString()}
          icon={faPlay}
          trend="down"
          trendValue="3.1%"
          color="amber"
        />
        <StatCard
          title="Total Spend"
          value={`$${totalSpend.toLocaleString()}`}
          icon={faDollarSign}
          trend="up"
          trendValue="15.3%"
          color="rose"
        />
      </div>

      {/* Second Row Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 col-span-2">
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-sm text-zinc-500 font-medium">Click-Through Rate (CTR)</p>
              <p className="text-4xl font-bold text-white mt-1">{ctr}%</p>
            </div>
            <div className="w-14 h-14 rounded-full bg-blue-500/10 flex items-center justify-center">
              <FontAwesomeIcon icon={faChartLine} className="w-7 h-7 text-blue-500" />
            </div>
          </div>
          <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 rounded-full"
              style={{ width: `${Math.min(100, parseFloat(ctr) * 10)}%` }}
            />
          </div>
          <p className="text-xs text-zinc-500 mt-3">Industry average: 1.5-2.5%</p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
          <p className="text-sm text-zinc-500 font-medium mb-4">Active Campaigns</p>
          <div className="flex items-end justify-between">
            <div>
              <p className="text-4xl font-bold text-white">{activeCampaigns}</p>
              <p className="text-xs text-zinc-500 mt-1">out of {campaigns.length} total</p>
            </div>
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <FontAwesomeIcon icon={faCalendar} className="w-6 h-6 text-emerald-500" />
            </div>
          </div>
        </div>
      </div>

      {/* Weekly Performance Chart */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-white">Weekly Performance</h3>
          <select className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-300 focus:outline-none focus:border-zinc-600">
            <option>Last 7 days</option>
            <option>Last 30 days</option>
            <option>Last 90 days</option>
          </select>
        </div>

        <div className="flex items-end justify-between h-40 gap-2">
          {weeklyData.map((day) => (
            <div key={day.day} className="flex-1 flex flex-col items-center gap-2 group">
              <div className="w-full relative h-32 bg-zinc-800 rounded-lg overflow-hidden">
                <div 
                  className="absolute bottom-0 left-0 w-full bg-blue-500/80 group-hover:bg-blue-500 transition-all"
                  style={{ height: `${(day.impressions / 2100) * 100}%` }}
                />
                <div 
                  className="absolute bottom-0 left-0 w-full bg-emerald-500/80 group-hover:bg-emerald-500 transition-all"
                  style={{ height: `${(day.clicks / 2100) * 100}%` }}
                />
              </div>
              <span className="text-xs text-zinc-500 font-medium">{day.day}</span>
              <div className="opacity-0 group-hover:opacity-100 absolute mt-20 bg-zinc-800 text-white text-xs rounded-lg p-2 whitespace-nowrap">
                <div>Impressions: {day.impressions}</div>
                <div>Clicks: {day.clicks}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-center gap-6 mt-6 pt-4 border-t border-zinc-800">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-blue-500 rounded-sm"></div>
            <span className="text-xs text-zinc-400">Impressions</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-emerald-500 rounded-sm"></div>
            <span className="text-xs text-zinc-400">Clicks</span>
          </div>
        </div>
      </div>

      {/* Top Performing Campaigns */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 sm:p-6 overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-white">Top Performing Campaigns</h3>
            <p className="text-xs text-zinc-400 mt-0.5">Campaigns ranked by engagement and impressions</p>
          </div>
          {campaigns.length > 0 && (
            <span className="text-xs text-zinc-500 hidden sm:inline-block">Swipe / scroll for all metrics →</span>
          )}
        </div>
        
        {campaigns.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 mx-auto mb-4 bg-zinc-800 rounded-full flex items-center justify-center">
              <FontAwesomeIcon icon={faChartLine} className="w-8 h-8 text-zinc-600" />
            </div>
            <p className="text-zinc-500">No campaigns yet</p>
            <p className="text-zinc-600 text-sm mt-1">Create your first ad to see performance data</p>
          </div>
        ) : (
          <div>
            {/* Mobile View: Dedicated cards with prominently positioned CTR badge */}
            <div className="block sm:hidden space-y-3">
              {campaigns.slice(0, 5).map((campaign) => {
                const impressions = campaign.analytics?.impressions ?? campaign.impressions ?? 0;
                const views = campaign.analytics?.views ?? campaign.views ?? 0;
                const clicks = campaign.analytics?.clicks ?? campaign.clicks ?? 0;
                const ctr = impressions > 0 
                  ? ((clicks / impressions) * 100).toFixed(1)
                  : '0.0';
                
                return (
                  <div key={campaign.id} className="p-3.5 bg-zinc-800/50 border border-zinc-800 rounded-xl space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-11 h-11 rounded-lg bg-zinc-800 overflow-hidden shrink-0 border border-zinc-700/50">
                          {campaign.mediaUrl ? (
                            <img src={campaign.mediaUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full bg-gradient-to-br from-blue-600 to-emerald-600" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-white truncate">{campaign.name}</p>
                          <p className="text-xs text-zinc-400 truncate">{campaign.location || 'Global'} • {campaign.days || 7}d</p>
                          <div className="mt-1">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-bold ${
                              campaign.status === 'active' 
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' 
                                : campaign.status === 'paused'
                                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                                : 'bg-zinc-500/10 text-zinc-400 border border-zinc-700'
                            }`}>
                              {(campaign.status || 'active').toUpperCase()}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Prominently Positioned CTR Badge on Mobile */}
                      <div className="shrink-0 bg-emerald-500/20 border border-emerald-500/40 px-3 py-1.5 rounded-xl text-center shadow-sm shadow-emerald-900/30">
                        <p className="text-base font-black text-emerald-400 leading-tight">{ctr}%</p>
                        <p className="text-[10px] uppercase font-extrabold text-emerald-300 tracking-wider">CTR</p>
                      </div>
                    </div>

                    {/* Stats 3-column row */}
                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-zinc-800/80 text-center">
                      <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-lg py-1.5 px-1">
                        <p className="text-xs font-bold text-white">{impressions.toLocaleString()}</p>
                        <p className="text-[10px] text-zinc-400">Impressions</p>
                      </div>
                      <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-lg py-1.5 px-1">
                        <p className="text-xs font-bold text-blue-400">{views.toLocaleString()}</p>
                        <p className="text-[10px] text-zinc-400">Views</p>
                      </div>
                      <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-lg py-1.5 px-1">
                        <p className="text-xs font-bold text-white">{clicks.toLocaleString()}</p>
                        <p className="text-[10px] text-zinc-400">Clicks</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop / Tablet View: Horizontal scrollable card rows */}
            <div className="hidden sm:block overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0 pb-2">
              <div className="space-y-3 min-w-[620px]">
                {campaigns.slice(0, 5).map((campaign) => {
                  const impressions = campaign.analytics?.impressions ?? campaign.impressions ?? 0;
                  const views = campaign.analytics?.views ?? campaign.views ?? 0;
                  const clicks = campaign.analytics?.clicks ?? campaign.clicks ?? 0;
                  const ctr = impressions > 0 
                    ? ((clicks / impressions) * 100).toFixed(1)
                    : '0.0';
                  
                  return (
                    <div key={campaign.id} className="flex items-center justify-between p-3.5 bg-zinc-800/40 border border-zinc-800/80 rounded-xl hover:bg-zinc-800/60 transition-colors gap-4">
                      <div className="flex items-center gap-3 min-w-[180px] max-w-[240px] shrink-0">
                        <div className="w-10 h-10 rounded-lg bg-zinc-800 overflow-hidden shrink-0 border border-zinc-700/50">
                          {campaign.mediaUrl ? (
                            <img src={campaign.mediaUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full bg-gradient-to-br from-blue-600 to-emerald-600" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-white truncate">{campaign.name}</p>
                          <p className="text-xs text-zinc-400 truncate">{campaign.location || 'Global'} • {campaign.days || 7}d</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 sm:gap-6 shrink-0">
                        <div className="text-right min-w-[70px]">
                          <p className="text-sm font-bold text-white">{impressions.toLocaleString()}</p>
                          <p className="text-[11px] text-zinc-400">Impressions</p>
                        </div>
                        <div className="text-right min-w-[60px]">
                          <p className="text-sm font-bold text-blue-400">{views.toLocaleString()}</p>
                          <p className="text-[11px] text-zinc-400">Views</p>
                        </div>
                        <div className="text-right min-w-[55px]">
                          <p className="text-sm font-bold text-white">{clicks.toLocaleString()}</p>
                          <p className="text-[11px] text-zinc-400">Clicks</p>
                        </div>
                        <div className="text-center min-w-[75px] bg-emerald-500/20 border border-emerald-500/35 px-2.5 py-1 rounded-lg">
                          <p className="text-sm font-black text-emerald-400">{ctr}%</p>
                          <p className="text-[10px] uppercase font-bold text-emerald-400/90 tracking-wider">CTR</p>
                        </div>
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold shrink-0 ${
                          campaign.status === 'active' 
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' 
                            : campaign.status === 'paused'
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                            : 'bg-zinc-500/10 text-zinc-400 border border-zinc-700'
                        }`}>
                          {(campaign.status || 'active').toUpperCase()}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
