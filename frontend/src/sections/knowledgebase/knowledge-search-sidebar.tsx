import type { Icon as IconifyIcon } from '@iconify/react';

import { Icon } from '@iconify/react';
import appIcon from '@iconify-icons/mdi/apps';
import { useNavigate } from 'react-router-dom';
import jiraIcon from '@iconify-icons/mdi/jira';
import closeIcon from '@iconify-icons/mdi/close';
import gmailIcon from '@iconify-icons/mdi/gmail';
import slackIcon from '@iconify-icons/mdi/slack';
import React, { useState, useEffect } from 'react';
import upIcon from '@iconify-icons/mdi/chevron-up';
import magnifyIcon from '@iconify-icons/mdi/magnify';
import dropboxIcon from '@iconify-icons/mdi/dropbox';
import leftIcon from '@iconify-icons/mdi/chevron-left';
import downIcon from '@iconify-icons/mdi/chevron-down';
import rightIcon from '@iconify-icons/mdi/chevron-right';
import salesforceIcon from '@iconify-icons/mdi/salesforce';
import viewModuleIcon from '@iconify-icons/mdi/view-module';
import filterMenuIcon from '@iconify-icons/mdi/filter-menu';
import googleDriveIcon from '@iconify-icons/mdi/google-drive';
import filterRemoveIcon from '@iconify-icons/mdi/filter-remove';
import officeBuildingIcon from '@iconify-icons/mdi/office-building';
import microsoftTeamsIcon from '@iconify-icons/mdi/microsoft-teams';
import formatListIcon from '@iconify-icons/mdi/format-list-bulleted';
import closeCircleIcon from '@iconify-icons/mdi/close-circle-outline';
import microsoftOnedriveIcon from '@iconify-icons/mdi/microsoft-onedrive';

import { alpha, styled, useTheme } from '@mui/material/styles';
import {
  Box,
  Chip,
  Badge,
  Paper,
  Drawer,
  Button,
  Tooltip,
  Checkbox,
  Collapse,
  FormGroup,
  TextField,
  Typography,
  IconButton,
  InputAdornment,
  FormControlLabel,
  CircularProgress,
} from '@mui/material';

// import { fetchModules, fetchDepartments, fetchRecordCategories } from './utils';

import type { Modules } from './types/modules';
import type { Departments } from './types/departments';
import type { RecordCategories } from './types/record-categories';
import type { Filters, KnowledgeSearchSideBarProps } from './types/knowledge-base';

// Connector definitions for app sources
const connectors = [
  { id: 'DRIVE', name: 'Google Drive', icon: googleDriveIcon, color: '#4285F4' },
  { id: 'GMAIL', name: 'Gmail', icon: gmailIcon, color: '#EA4335' },
  { id: 'SLACK', name: 'Slack', icon: slackIcon, color: '#4A154B' },
  { id: 'JIRA', name: 'Jira', icon: jiraIcon, color: '#0052CC' },
  { id: 'SALESFORCE', name: 'Salesforce', icon: salesforceIcon, color: '#00A1E0' },
  { id: 'DROPBOX', name: 'Dropbox', icon: dropboxIcon, color: '#0061FF' },
  { id: 'TEAMS', name: 'Microsoft Teams', icon: microsoftTeamsIcon, color: '#6264A7' },
  { id: 'ONEDRIVE', name: 'OneDrive', icon: microsoftOnedriveIcon, color: '#0078D4' },
];

// Constants
const drawerWidth = 320;
const closedDrawerWidth = 64;

// Types for styled components
interface FilterHeaderProps {
  expanded?: boolean;
}

interface FilterSectionComponentProps {
  id: string;
  icon: React.ComponentProps<typeof IconifyIcon>['icon'];
  label: string;
  filterType: keyof Filters;
  items: any[];
  getItemId?: (item: any) => string;
  getItemLabel?: (item: any) => string;
  renderItemLabel?: ((item: any) => React.ReactNode) | null;
  expanded?: boolean;
  onToggle?: () => void;
  activeFilters?: string[];
}

// Custom styled components with smooth transitions
const OpenedDrawer = styled(Drawer, { shouldForwardProp: (prop) => prop !== 'open' })(
  ({ theme, open }) => ({
    width: open ? drawerWidth : closedDrawerWidth,
    flexShrink: 0,
    whiteSpace: 'nowrap',
    boxSizing: 'border-box',
    '& .MuiDrawer-paper': {
      width: open ? drawerWidth : closedDrawerWidth,
      transition: theme.transitions.create('width', {
        easing: theme.transitions.easing.easeInOut,
        duration: '0.35s',
      }),
      overflowX: 'hidden',
      borderRight: 'none',
      backgroundColor: theme.palette.background.paper,
      boxShadow: '0 0 20px rgba(0, 0, 0, 0.05)',
      marginTop: theme.spacing(8),
    },
  })
);

const DrawerHeader = styled('div')(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: theme.spacing(2, 2.5),
  ...theme.mixins.toolbar,
  borderBottom: `1px solid ${alpha(theme.palette.divider, 0.5)}`,
}));

const FilterSection = styled(Paper)(({ theme }) => ({
  borderRadius: theme.shape.borderRadius,
  marginBottom: theme.spacing(1.5),
  overflow: 'hidden',
  transition: theme.transitions.create(['background-color', 'box-shadow'], {
    duration: '0.25s',
    easing: theme.transitions.easing.easeInOut,
  }),
  border: `1px solid ${alpha(theme.palette.divider, 0.5)}`,
  boxShadow: 'none',
}));

// Updated to accept the expanded prop properly with a type
const FilterHeader = styled('div', {
  shouldForwardProp: (prop) => prop !== 'expanded',
})<FilterHeaderProps>(({ theme, expanded }) => ({
  padding: theme.spacing(1.5, 2),
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  cursor: 'pointer',
  borderRadius: `${theme.shape.borderRadius}px ${theme.shape.borderRadius}px 0 0`,
  backgroundColor: expanded
    ? alpha(theme.palette.primary.main, 0.05)
    : alpha(theme.palette.background.default, 0.5),
  '&:hover': {
    backgroundColor: alpha(theme.palette.primary.main, 0.08),
  },
  transition: theme.transitions.create('background-color', {
    duration: '0.2s',
    easing: theme.transitions.easing.easeInOut,
  }),
}));

const FilterContent = styled(Collapse)(({ theme }) => ({
  padding: theme.spacing(1, 2, 1.5, 2),
  maxHeight: 260,
  overflow: 'auto',
  '&::-webkit-scrollbar': {
    width: '4px',
  },
  '&::-webkit-scrollbar-track': {
    background: 'transparent',
  },
  '&::-webkit-scrollbar-thumb': {
    backgroundColor: alpha(theme.palette.text.secondary, 0.2),
    borderRadius: '4px',
  },
  transition: theme.transitions.create(['height', 'opacity'], {
    duration: '0.3s',
    easing: theme.transitions.easing.easeInOut,
  }),
}));

const FilterLabel = styled(Typography)(({ theme }) => ({
  fontWeight: 500,
  fontSize: '0.9rem',
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(1.5),
  color: theme.palette.text.primary,
}));

const FilterCheckbox = styled(Checkbox)(({ theme }) => ({
  padding: theme.spacing(0.5),
  '&.Mui-checked': {
    color: theme.palette.primary.main,
  },
}));

const FilterCount = styled(Badge)(({ theme }) => ({
  '& .MuiBadge-badge': {
    right: -12,
    top: 2,
    fontSize: '0.7rem',
    height: 18,
    minWidth: 18,
    border: `2px solid ${theme.palette.background.paper}`,
    padding: '0 4px',
  },
}));

const FiltersContainer = styled(Box)(({ theme }) => ({
  height: 'calc(100vh - 130px)',
  overflow: 'auto',
  padding: theme.spacing(2, 1.5),
  '&::-webkit-scrollbar': {
    width: '4px',
  },
  '&::-webkit-scrollbar-track': {
    background: 'transparent',
  },
  '&::-webkit-scrollbar-thumb': {
    backgroundColor: alpha(theme.palette.text.secondary, 0.15),
    borderRadius: '10px',
  },
  transition: theme.transitions.create('opacity', {
    duration: '0.3s',
    easing: theme.transitions.easing.easeInOut,
  }),
}));

const FilterChip = styled(Chip)(({ theme }) => ({
  margin: theme.spacing(0.5),
  borderRadius: '6px',
  height: 28,
  backgroundColor: alpha(theme.palette.primary.main, 0.08),
  color: theme.palette.primary.dark,
  border: `1px solid ${alpha(theme.palette.primary.main, 0.15)}`,
  transition: theme.transitions.create(['background-color', 'box-shadow'], {
    duration: '0.2s',
    easing: theme.transitions.easing.easeInOut,
  }),
  '&:hover': {
    backgroundColor: alpha(theme.palette.primary.main, 0.12),
  },
  '& .MuiChip-deleteIcon': {
    color: theme.palette.primary.main,
    width: 16,
    height: 16,
  },
}));

const ActiveFiltersContainer = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(1.5, 2),
  marginBottom: theme.spacing(2.5),
  display: 'flex',
  flexWrap: 'wrap',
  backgroundColor: alpha(theme.palette.background.default, 0.5),
  borderRadius: theme.shape.borderRadius,
  border: `1px solid ${alpha(theme.palette.divider, 0.5)}`,
  animation: 'fadeIn 0.3s ease-in-out',
  '@keyframes fadeIn': {
    '0%': {
      opacity: 0,
      transform: 'translateY(-10px)',
    },
    '100%': {
      opacity: 1,
      transform: 'translateY(0)',
    },
  },
}));

const ClearFiltersButton = styled(Button)(({ theme }) => ({
  minWidth: 'auto',
  padding: theme.spacing(0.5, 1),
  fontSize: '0.75rem',
  textTransform: 'none',
  color: theme.palette.primary.main,
  fontWeight: 500,
  transition: theme.transitions.create(['background-color', 'color'], {
    duration: '0.15s',
    easing: theme.transitions.easing.easeInOut,
  }),
}));

const FormControlLabelStyled = styled(FormControlLabel)(({ theme }) => ({
  marginBottom: 4,
  marginLeft: -8,
  '& .MuiTypography-root': {
    fontSize: '0.85rem',
    fontWeight: 400,
  },
  opacity: 1,
  transition: theme.transitions.create('opacity', {
    duration: '0.2s',
    easing: theme.transitions.easing.easeInOut,
  }),
  '&:hover': {
    opacity: 0.9,
  },
}));

const CollapsedButtonContainer = styled(Box)(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  paddingTop: theme.spacing(2),
  animation: 'fadeInRight 0.3s ease-in-out',
  '@keyframes fadeInRight': {
    '0%': {
      opacity: 0,
      transform: 'translateX(-10px)',
    },
    '100%': {
      opacity: 1,
      transform: 'translateX(0)',
    },
  },
}));

const IconButtonStyled = styled(IconButton)(({ theme }) => ({
  transition: theme.transitions.create(['background-color', 'transform', 'color'], {
    duration: '0.15s',
    easing: theme.transitions.easing.easeInOut,
  }),
  '&:hover': {
    transform: 'scale(1.05)',
  },
  '&:active': {
    transform: 'scale(0.95)',
  },
}));

const SearchInput = styled(TextField)(({ theme }) => ({
  marginBottom: theme.spacing(2),
  '& .MuiOutlinedInput-root': {
    backgroundColor: alpha(theme.palette.background.default, 0.8),
    borderRadius: theme.shape.borderRadius,
    '&:hover .MuiOutlinedInput-notchedOutline': {
      borderColor: alpha(theme.palette.primary.main, 0.3),
    },
    '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
      borderColor: theme.palette.primary.main,
    },
  },
  '& .MuiOutlinedInput-input': {
    padding: theme.spacing(1, 1, 1, 0.5),
    fontSize: '0.85rem',
  },
}));

// Helper function to format labels
const formatLabel = (label: string): string => {
  if (!label) return '';
  return label
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (l: string) => l.toUpperCase());
};

export default function KnowledgeSearchSideBar({
  filters,
  onFilterChange,
  sx = {},
  openSidebar,
  onToggleSidebar,
}: KnowledgeSearchSideBarProps) {
  const theme = useTheme();
  const navigate = useNavigate();
  const [open, setOpen] = useState<boolean>(true);
  const [departments, setDepartments] = useState<Departments[]>([]);
  const [recordCategories, setRecordCategories] = useState<RecordCategories[]>([]);
  const [modules, setModules] = useState<Modules[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [expandedSections, setExpandedSections] = useState<{ [key: string]: boolean }>({
    connectors: true,
    departments: false,
    modules: false,
    categories: false,
  });
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    setOpen(openSidebar);
  }, [openSidebar]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // const [deptData, catData, moduleData] = await Promise.all([
        //   // fetchDepartments(),
        //   // fetchRecordCategories(),
        //   // fetchModules(),
        // ]);
        // setDepartments();
        // setRecordCategories();
        // setModules();
      } catch (error) {
        console.error('Error fetching filter data:', error);
        // Use fallback mock data in case of API error
        setDepartments([
          {
            _id: 'engineering',
            name: 'Engineering',
            tag: 'eng',
            origin: 'system',
            description: '',
            orgId: '',
            isDeleted: false,
            __v: 0,
            createdAt: '',
            updatedAt: '',
          },
          {
            _id: 'product',
            name: 'Product Management',
            tag: 'pm',
            origin: 'system',
            description: '',
            orgId: '',
            isDeleted: false,
            __v: 0,
            createdAt: '',
            updatedAt: '',
          },
          {
            _id: 'design',
            name: 'Design',
            tag: 'design',
            origin: 'system',
            description: '',
            orgId: '',
            isDeleted: false,
            __v: 0,
            createdAt: '',
            updatedAt: '',
          },
          {
            _id: 'marketing',
            name: 'Marketing',
            tag: 'mktg',
            origin: 'system',
            description: '',
            orgId: '',
            isDeleted: false,
            __v: 0,
            createdAt: '',
            updatedAt: '',
          },
          {
            _id: 'sales',
            name: 'Sales',
            tag: 'sales',
            origin: 'system',
            description: '',
            orgId: '',
            isDeleted: false,
            __v: 0,
            createdAt: '',
            updatedAt: '',
          },
        ]);
        setRecordCategories([
          {
            _id: 'technical',
            name: 'Technical Documentation',
            tag: 'tech',
            origin: 'system',
            description: '',
            orgId: '',
            isDeleted: false,
            __v: 0,
            createdAt: '',
            updatedAt: '',
          },
          {
            _id: 'product',
            name: 'Product Documentation',
            tag: 'prod',
            origin: 'system',
            description: '',
            orgId: '',
            isDeleted: false,
            __v: 0,
            createdAt: '',
            updatedAt: '',
          },
          {
            _id: 'process',
            name: 'Process Documentation',
            tag: 'proc',
            origin: 'system',
            description: '',
            orgId: '',
            isDeleted: false,
            __v: 0,
            createdAt: '',
            updatedAt: '',
          },
        ]);
        setModules([
          {
            _id: 'module1',
            name: 'User Management',
            description: '',
            orgId: '',
            isDeleted: false,
            createdAt: '',
            updatedAt: '',
            __v: 0,
          },
          {
            _id: 'module2',
            name: 'Authentication',
            description: '',
            orgId: '',
            isDeleted: false,
            createdAt: '',
            updatedAt: '',
            __v: 0,
          },
          {
            _id: 'module3',
            name: 'Reporting',
            description: '',
            orgId: '',
            isDeleted: false,
            createdAt: '',
            updatedAt: '',
            __v: 0,
          },
        ]);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleDrawerToggle = () => {
    setOpen(!open);
  };

  const toggleSection = (section: string) => {
    setExpandedSections({
      ...expandedSections,
      [section]: !expandedSections[section],
    });
  };

  const handleFilterChange = (filterType: keyof Filters, value: string) => {
    // Safely access the current filter array with a fallback to empty array if undefined
    const currentFilterValues = filters[filterType] || [];

    // Create updated filters
    const updatedFilters = {
      ...filters,
      [filterType]: currentFilterValues.includes(value)
        ? currentFilterValues.filter((item: string) => item !== value)
        : [...currentFilterValues, value],
    };

    onFilterChange(updatedFilters);
  };

  // Handle click on collapsed filter icon
  const handleCollapsedFilterClick = (sectionId: string, filterType: keyof Filters) => {
    // If drawer is closed, open it
    if (!open) {
      setOpen(true);

      // Expand the section that was clicked
      setExpandedSections({
        ...expandedSections,
        [sectionId]: true,
      });
    }
  };

  // Get count of active filters
  const getActiveFilterCount = (filterType: keyof Filters): number =>
    (filters[filterType] || []).length;

  // Get total count of active filters
  const getTotalActiveFilterCount = (): number =>
    Object.values(filters).reduce((acc, curr) => acc + (curr || []).length, 0);

  // Get filter item names by IDs
  const getFilterName = (type: keyof Filters, id: string): string => {
    switch (type) {
      case 'department':
        return departments.find((d) => d._id === id)?.name || id;
      case 'moduleId':
        return modules.find((m) => m._id === id)?.name || id;
      case 'appSpecificRecordType':
        return recordCategories.find((c) => c._id === id)?.name || id;
      case 'connector':
        return connectors.find((c) => c.id === id)?.name || id;
      default:
        return id;
    }
  };

  // Clear a specific filter
  const clearFilter = (type: keyof Filters, value: string) => {
    const updatedFilters = {
      ...filters,
      [type]: (filters[type] || []).filter((item) => item !== value),
    };
    onFilterChange(updatedFilters);
  };

  // Clear all filters
  const clearAllFilters = () => {
    onFilterChange({
      department: [],
      moduleId: [],
      appSpecificRecordType: [],
      connector: [],
    });
  };

  // Check if there are any active filters
  const hasActiveFilters = getTotalActiveFilterCount() > 0;

  // Filter items based on search term
  const filterItems = <T extends { name: string; id?: string }>(items: T[]): T[] => {
    if (!searchTerm) return items;
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.id && item.id.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  };

  // Generate active filters view
  const renderActiveFilters = () => {
    if (!hasActiveFilters) return null;

    return (
      <ActiveFiltersContainer elevation={0}>
        <Box
          sx={{
            width: '100%',
            display: 'flex',
            justifyContent: 'space-between',
            mb: 1.5,
            alignItems: 'center',
          }}
        >
          <Typography variant="body2" fontWeight={600} color="primary" sx={{ fontSize: '0.85rem' }}>
            Active Filters ({getTotalActiveFilterCount()})
          </Typography>
          <ClearFiltersButton
            variant="text"
            size="small"
            onClick={clearAllFilters}
            startIcon={<Icon icon={closeCircleIcon} fontSize="small" />}
          >
            Clear All
          </ClearFiltersButton>
        </Box>
        <Box sx={{ display: 'flex', flexWrap: 'wrap' }}>
          {Object.entries(filters).map(([type, values]) =>
            (values || []).map((value: any) => (
              <FilterChip
                key={`${type}-${value}`}
                label={getFilterName(type as keyof Filters, value)}
                size="small"
                onDelete={() => clearFilter(type as keyof Filters, value)}
                deleteIcon={<Icon icon={closeIcon} fontSize="small" />}
              />
            ))
          )}
        </Box>
      </ActiveFiltersContainer>
    );
  };

  // Collapsed sidebar content
  const renderCollapsedContent = () => (
    <CollapsedButtonContainer>
      <Tooltip title="App Sources" placement="right">
        <IconButtonStyled
          color="primary"
          sx={{ mb: 2 }}
          onClick={() => handleCollapsedFilterClick('connectors', 'connector')}
        >
          <Badge badgeContent={getActiveFilterCount('connector')} color="primary">
            <Icon icon={appIcon} />
          </Badge>
        </IconButtonStyled>
      </Tooltip>
      <Tooltip title="Department Filters" placement="right">
        <IconButtonStyled
          color="primary"
          sx={{ mb: 2 }}
          onClick={() => handleCollapsedFilterClick('departments', 'department')}
        >
          <Badge badgeContent={getActiveFilterCount('department')} color="primary">
            <Icon icon={officeBuildingIcon} />
          </Badge>
        </IconButtonStyled>
      </Tooltip>
      <Tooltip title="Module Filters" placement="right">
        <IconButtonStyled
          color="primary"
          sx={{ mb: 2 }}
          onClick={() => handleCollapsedFilterClick('modules', 'moduleId')}
        >
          <Badge badgeContent={getActiveFilterCount('moduleId')} color="primary">
            <Icon icon={viewModuleIcon} />
          </Badge>
        </IconButtonStyled>
      </Tooltip>
      <Tooltip title="Category Filters" placement="right">
        <IconButtonStyled
          color="primary"
          sx={{ mb: 2 }}
          onClick={() => handleCollapsedFilterClick('categories', 'appSpecificRecordType')}
        >
          <Badge badgeContent={getActiveFilterCount('appSpecificRecordType')} color="primary">
            <Icon icon={formatListIcon} />
          </Badge>
        </IconButtonStyled>
      </Tooltip>

      {hasActiveFilters && (
        <Tooltip title="Clear All Filters" placement="right">
          <IconButtonStyled
            color="error"
            onClick={clearAllFilters}
            sx={{
              mt: 2,
              bgcolor: alpha(theme.palette.error.main, 0.1),
              '&:hover': {
                bgcolor: alpha(theme.palette.error.main, 0.2),
              },
            }}
          >
            <Icon icon={filterRemoveIcon} />
          </IconButtonStyled>
        </Tooltip>
      )}
    </CollapsedButtonContainer>
  );

  // Filter section component with enhanced styling
  const FilterSectionComponent = ({
    id,
    icon,
    label,
    filterType,
    items,
    getItemId = (item: any) => item._id || item.id,
    getItemLabel = (item: any) => item.name,
    renderItemLabel = null,
    expanded,
    onToggle,
    activeFilters = [],
  }: FilterSectionComponentProps) => {
    const isExpanded = expanded !== undefined ? expanded : expandedSections[id];
    const handleToggle = onToggle || (() => toggleSection(id));

    return (
      <FilterSection>
        <FilterHeader expanded={isExpanded} onClick={handleToggle}>
          <FilterLabel>
            <Icon
              icon={icon}
              fontSize="small"
              style={{
                color: isExpanded
                  ? theme.palette.primary.main
                  : alpha(theme.palette.text.primary, 0.7),
              }}
            />
            {label}
            {getActiveFilterCount(filterType) > 0 && (
              <FilterCount badgeContent={getActiveFilterCount(filterType)} color="primary" />
            )}
          </FilterLabel>
          <Icon
            icon={isExpanded ? upIcon : downIcon}
            fontSize="small"
            style={{ color: alpha(theme.palette.text.primary, 0.7) }}
          />
        </FilterHeader>
        <FilterContent in={isExpanded}>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
              <CircularProgress size={24} />
            </Box>
          ) : (
            <FormGroup>
              {filterItems(items).map((item) => {
                const itemId = typeof item === 'string' ? item : getItemId(item);
                // eslint-disable-next-line
                const isChecked = filters[filterType]?.includes(itemId) || false;

                return (
                  <FormControlLabelStyled
                    key={itemId}
                    control={
                      <FilterCheckbox
                        checked={isChecked}
                        onChange={() => handleFilterChange(filterType, itemId)}
                        size="small"
                        sx={{
                          color: isChecked ? theme.palette.primary.main : undefined,
                        }}
                      />
                    }
                    label={
                      renderItemLabel !== null
                        ? renderItemLabel(item)
                        : typeof item === 'string'
                          ? formatLabel(item)
                          : getItemLabel(item)
                    }
                  />
                );
              })}

              {filterItems(items).length === 0 && (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ py: 1, textAlign: 'center' }}
                >
                  No matching items
                </Typography>
              )}
            </FormGroup>
          )}
        </FilterContent>
      </FilterSection>
    );
  };

  return (
    <OpenedDrawer variant="permanent" open={open} sx={sx}>
      <DrawerHeader>
        {open ? (
          <>
            <Typography
              variant="subtitle1"
              fontWeight={600}
              sx={{
                color: theme.palette.primary.main,
                display: 'flex',
                alignItems: 'center',
                gap: 1,
              }}
            >
              <Icon icon={filterMenuIcon} />
              Filters
            </Typography>
            <Tooltip title="Collapse sidebar">
              <IconButtonStyled
                onClick={handleDrawerToggle}
                size="small"
                sx={{ color: theme.palette.text.secondary }}
              >
                <Icon icon={leftIcon} width={20} height={20} />
              </IconButtonStyled>
            </Tooltip>
          </>
        ) : (
          <Tooltip title="Expand sidebar" placement="right">
            <IconButtonStyled
              onClick={handleDrawerToggle}
              sx={{ mx: 'auto', color: theme.palette.primary.main }}
            >
              <Icon icon={rightIcon} width={20} height={20} />
            </IconButtonStyled>
          </Tooltip>
        )}
      </DrawerHeader>

      {!open ? (
        renderCollapsedContent()
      ) : (
        <FiltersContainer>
          <SearchInput
            fullWidth
            size="small"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search filters..."
            variant="outlined"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Icon icon={magnifyIcon} fontSize="small" />
                </InputAdornment>
              ),
              endAdornment: searchTerm ? (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setSearchTerm('')}>
                    <Icon icon={closeIcon} fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ) : null,
            }}
          />

          {renderActiveFilters()}

          <FilterSectionComponent
            id="connectors"
            icon={appIcon}
            label="App Sources"
            filterType="connector"
            items={connectors}
            renderItemLabel={(connector) => (
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <Icon
                  icon={connector.icon}
                  style={{
                    marginRight: theme.spacing(1),
                    color: connector.color,
                  }}
                />
                <Typography variant="body2">{connector.name}</Typography>
              </Box>
            )}
          />

          {/* <FilterSectionComponent
            id="departments"
            icon="mdi:office-building"
            label="Departments"
            filterType="department"
            items={departments}
          /> */}

          {/* <FilterSectionComponent
            id="modules"
            icon="mdi:view-module"
            label="Modules"
            filterType="moduleId"
            items={modules}
          /> */}

          {/* <FilterSectionComponent
            id="categories"
            icon="mdi:format-list-bulleted"
            label="Record Categories"
            filterType="appSpecificRecordType"
            items={recordCategories}
          /> */}
        </FiltersContainer>
      )}
    </OpenedDrawer>
  );
}
