import { Icon } from '@iconify/react';
import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

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
  Typography,
  IconButton,
  FormControlLabel,
} from '@mui/material';

import type { Modules } from './types/modules';
import type { Departments } from './types/departments';
import type { SearchTagsRecords } from './types/search-tags';
import type { RecordCategories } from './types/record-categories';
import type {
  Filters,
  FilterHeaderProps,
  KnowledgeBaseSideBarProps,
  FilterSectionComponentProps,
} from './types/knowledge-base';

// Constants
const DRAWER_EXPANDED_WIDTH = 320;
const DRAWER_COLLAPSED_WIDTH = 64;

// Custom styled components with smooth transitions
const OpenedDrawer = styled(Drawer, { shouldForwardProp: (prop) => prop !== 'open' })(
  ({ theme, open }) => ({
    width: open ? DRAWER_EXPANDED_WIDTH : DRAWER_COLLAPSED_WIDTH,
    flexShrink: 0,
    marginTop: 50,
    whiteSpace: 'nowrap',
    boxSizing: 'border-box',
    transition: theme.transitions.create('width', {
      easing: theme.transitions.easing.easeInOut,
      duration: '0.3s', // Consistent duration for smoother transition
    }),
    '& .MuiDrawer-paper': {
      marginTop: 64,
      width: open ? DRAWER_EXPANDED_WIDTH : DRAWER_COLLAPSED_WIDTH,
      transition: theme.transitions.create(['width', 'margin'], {
        easing: theme.transitions.easing.easeInOut,
        duration: '0.3s', // Matched with parent transition
      }),
      overflowX: 'hidden',
      borderRight: 'none',
      backgroundColor: theme.palette.background.paper,
      boxShadow: theme.shadows[2],
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

const FilterSection = styled('div')(({ theme }) => ({
  borderRadius: theme.shape.borderRadius,
  marginBottom: theme.spacing(1),
  overflow: 'hidden',
  transition: theme.transitions.create(['background-color', 'box-shadow'], {
    duration: '0.25s',
    easing: theme.transitions.easing.easeInOut,
  }),
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
  borderRadius: theme.shape.borderRadius,
  backgroundColor: expanded ? alpha(theme.palette.primary.main, 0.04) : 'transparent',
  '&:hover': {
    backgroundColor: alpha(theme.palette.primary.main, 0.08),
  },
  transition: theme.transitions.create('background-color', {
    duration: '0.2s',
    easing: theme.transitions.easing.easeInOut,
  }),
}));

const FilterContent = styled(Collapse)(({ theme }) => ({
  padding: theme.spacing(0.5, 2, 1.5, 2),
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
  height: 'calc(100vh - 110px)',
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
  transition: theme.transitions.create(['opacity', 'transform'], {
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

const CollapsedButtonContainer = styled(Box, {
  shouldForwardProp: (prop) => prop !== 'visible',
})<{ visible: boolean }>(({ theme, visible }) => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  paddingTop: theme.spacing(2),
  opacity: visible ? 1 : 0,
  transform: visible ? 'translateX(0)' : 'translateX(-10px)',
  transition: theme.transitions.create(['opacity', 'transform'], {
    duration: '0.3s',
    easing: theme.transitions.easing.easeInOut,
    delay: visible ? '0.1s' : '0s',
  }),
}));

const ExpandedContentContainer = styled(Box, {
  shouldForwardProp: (prop) => prop !== 'visible',
})<{ visible: boolean }>(({ theme, visible }) => ({
  opacity: visible ? 1 : 0,
  transform: visible ? 'translateX(0)' : 'translateX(10px)',
  transition: theme.transitions.create(['opacity', 'transform'], {
    duration: '0.3s',
    easing: theme.transitions.easing.easeInOut,
    delay: visible ? '0.1s' : '0s',
  }),
  width: '100%',
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

// Status icons mapping
const statusIcons: Record<string, string> = {
  NOT_STARTED: 'mdi:circle-outline',
  IN_PROGRESS: 'mdi:progress-clock',
  FAILED: 'mdi:alert-circle-outline',
  COMPLETED: 'mdi:check-circle-outline',
};

// Helper function to format labels
const formatLabel = (label: string): string => {
  if (!label) return '';
  return label
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (l: string) => l.toUpperCase());
};

export default function KnowledgeBaseSideBar({
  filters,
  onFilterChange,
  openSidebar = true,
  onToggleSidebar,
  sx = {},
}: KnowledgeBaseSideBarProps) {
  const theme = useTheme();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState<boolean>(true);
  const [departments, setDepartments] = useState<Departments[]>([]);
  const [recordCategories, setRecordCategories] = useState<RecordCategories[]>([]);
  const [modules, setModules] = useState<Modules[]>([]);
  const [tags, setTags] = useState<SearchTagsRecords[]>([]);
  const [expandedSections, setExpandedSections] = useState<{ [key: string]: boolean }>({
    status: true,
  });
  
  // Smoothly manage content appearance
  const [showCollapsedContent, setShowCollapsedContent] = useState(!openSidebar);
  const [showExpandedContent, setShowExpandedContent] = useState(openSidebar);

  // Status color mapping using theme colors
  const statusColors: Record<string, string> = {
    NOT_STARTED: theme.palette.grey[500],
    IN_PROGRESS: theme.palette.info.main,
    FAILED: theme.palette.error.main,
    COMPLETED: theme.palette.success.main,
  };

  // Sync internal state with prop
  useEffect(() => {
    setOpen(openSidebar);
    
    // Manage content visibility with a slight delay for smooth transitions
    if (openSidebar) {
      setShowCollapsedContent(false);
      // Short delay before showing expanded content
      setTimeout(() => setShowExpandedContent(true), 150);
    } else {
      setShowExpandedContent(false);
      // Short delay before showing collapsed content
      setTimeout(() => setShowCollapsedContent(true), 150);
    }
  }, [openSidebar]);

  const handleDrawerToggle = () => {
    const newOpenState = !open;
    setOpen(newOpenState);
    
    if (onToggleSidebar) {
      onToggleSidebar();
    }
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
      if (onToggleSidebar) {
        onToggleSidebar();
      }

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
      case 'searchTags':
        return tags.find((t) => t._id === id)?.name || id;
      case 'appSpecificRecordType':
        return recordCategories.find((c) => c._id === id)?.name || id;
      case 'indexingStatus':
        return formatLabel(id);
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
      indexingStatus: [],
      department: [],
      moduleId: [],
      searchTags: [],
      appSpecificRecordType: [],
    });
  };

  // Check if there are any active filters
  const hasActiveFilters = getTotalActiveFilterCount() > 0;

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
            startIcon={<Icon icon="mdi:close-circle-outline" fontSize="small" />}
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
                deleteIcon={<Icon icon="mdi:close" fontSize="small" />}
              />
            ))
          )}
        </Box>
      </ActiveFiltersContainer>
    );
  };

  // Collapsed sidebar content
  const renderCollapsedContent = () => (
    <CollapsedButtonContainer visible={showCollapsedContent}>
      <Tooltip title="Status Filters" placement="right">
        <IconButtonStyled
          color="primary"
          sx={{ mb: 2 }}
          onClick={() => handleCollapsedFilterClick('status', 'indexingStatus')}
        >
          <Badge badgeContent={getActiveFilterCount('indexingStatus')} color="primary">
            <Icon icon="mdi:filter-variant" />
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
            <Icon icon="mdi:office-building" />
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
            <Icon icon="mdi:view-module" />
          </Badge>
        </IconButtonStyled>
      </Tooltip>
      <Tooltip title="Tag Filters" placement="right">
        <IconButtonStyled
          color="primary"
          sx={{ mb: 2 }}
          onClick={() => handleCollapsedFilterClick('tags', 'searchTags')}
        >
          <Badge badgeContent={getActiveFilterCount('searchTags')} color="primary">
            <Icon icon="mdi:tag" />
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
            <Icon icon="mdi:format-list-bulleted" />
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
            <Icon icon="mdi:filter-remove" />
          </IconButtonStyled>
        </Tooltip>
      )}
    </CollapsedButtonContainer>
  );

  // Filter section component
  const FilterSectionComponent = ({
    id,
    icon,
    label,
    filterType,
    items,
    getItemId = (item: any) => item._id,
    getItemLabel = (item: any) => item.name,
    renderItemLabel = null,
  }: FilterSectionComponentProps) => (
    <FilterSection>
      <FilterHeader expanded={expandedSections[id] || false} onClick={() => toggleSection(id)}>
        <FilterLabel>
          <Icon
            icon={icon}
            fontSize="small"
            color={expandedSections[id] ? theme.palette.primary.main : theme.palette.text.secondary}
          />
          {label}
          {getActiveFilterCount(filterType) > 0 && (
            <FilterCount badgeContent={getActiveFilterCount(filterType)} color="primary" />
          )}
        </FilterLabel>
        <Icon
          icon={expandedSections[id] ? 'mdi:chevron-up' : 'mdi:chevron-down'}
          fontSize="small"
          color={theme.palette.text.secondary}
        />
      </FilterHeader>
      <FilterContent in={expandedSections[id] || false}>
        <FormGroup>
          {items.map((item) => (
            <FormControlLabelStyled
              key={typeof item === 'string' ? item : getItemId(item)}
              control={
                <FilterCheckbox
                  checked={
                    filters[filterType]?.includes(
                      typeof item === 'string' ? item : getItemId(item)
                    ) || false
                  }
                  onChange={() =>
                    handleFilterChange(
                      filterType,
                      typeof item === 'string' ? item : getItemId(item)
                    )
                  }
                  size="small"
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
          ))}
        </FormGroup>
      </FilterContent>
    </FilterSection>
  );

  return (
    <OpenedDrawer 
      variant="permanent" 
      open={open}
      sx={{
        ...sx,
        transition: theme.transitions.create('width', {
          duration: '0.3s',
          easing: theme.transitions.easing.easeInOut,
        }),
      }}
    >
      <DrawerHeader>
        {open ? (
          <>
            <Typography
              variant="subtitle1"
              fontWeight={600}
              sx={{ color: theme.palette.primary.main }}
            >
              <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Icon icon="mdi:filter-menu" />
                Filters
              </Box>
            </Typography>
            <Tooltip title="Collapse sidebar">
              <IconButtonStyled
                onClick={handleDrawerToggle}
                size="small"
                sx={{ 
                  color: theme.palette.text.secondary,
                  transition: theme.transitions.create('transform', {
                    duration: '0.3s',
                    easing: theme.transitions.easing.easeInOut,
                  }),
                }}
              >
                <Icon icon="mdi:chevron-left" width={20} height={20} />
              </IconButtonStyled>
            </Tooltip>
          </>
        ) : (
          <Tooltip title="Expand sidebar" placement="right">
            <IconButtonStyled
              onClick={handleDrawerToggle}
              sx={{ 
                mx: 'auto', 
                color: theme.palette.primary.main,
                transition: theme.transitions.create('transform', {
                  duration: '0.3s',
                  easing: theme.transitions.easing.easeInOut,
                }),
              }}
            >
              <Icon icon="mdi:chevron-right" width={20} height={20} />
            </IconButtonStyled>
          </Tooltip>
        )}
      </DrawerHeader>

      {!open ? (
        renderCollapsedContent()
      ) : (
        <ExpandedContentContainer visible={showExpandedContent}>
          <FiltersContainer>
            {renderActiveFilters()}

            <FilterSectionComponent
              id="status"
              icon="mdi:filter-variant"
              label="Status"
              filterType="indexingStatus"
              items={['NOT_STARTED', 'IN_PROGRESS', 'FAILED', 'COMPLETED']}
              renderItemLabel={(status: string) => (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Icon
                    icon={statusIcons[status]}
                    color={statusColors[status]}
                    width={16}
                    height={16}
                  />
                  {formatLabel(status)}
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
              id="tags"
              icon="mdi:tag"
              label="Tags"
              filterType="searchTags"
              items={tags}
            /> */}

            {/* <FilterSectionComponent
              id="categories"
              icon="mdi:format-list-bulleted"
              label="Record Categories"
              filterType="appSpecificRecordType"
              items={recordCategories}
            /> */}
          </FiltersContainer>
        </ExpandedContentContainer>
      )}
    </OpenedDrawer>
  );
}