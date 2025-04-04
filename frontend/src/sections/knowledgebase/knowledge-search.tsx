import { Icon } from '@iconify/react';
import { useNavigate } from 'react-router';
import React, { useRef, useState, useEffect, useCallback } from 'react';

import {
  Box,
  Card,
  Chip,
  Paper,
  alpha,
  Button,
  Divider,
  Tooltip,
  useTheme,
  Skeleton,
  TextField,
  IconButton,
  Typography,
  CardContent,
  InputAdornment,
  CircularProgress,
} from '@mui/material';

import { useUsers } from 'src/context/UserContext';

import type { SearchResult, KnowledgeSearchProps } from './types/search-response';
import { ORIGIN } from './constants/knowledge-search';

// Helper function to get file icon based on extension
const getFileIcon = (extension: string): string => {
  const ext = extension?.toLowerCase() || '';

  switch (ext) {
    case 'pdf':
      return 'mdi:file-pdf-box';
    case 'doc':
    case 'docx':
      return 'mdi:file-word-box';
    case 'xls':
    case 'xlsx':
      return 'mdi:file-excel-box';
    case 'ppt':
    case 'pptx':
      return 'mdi:file-powerpoint-box';
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'gif':
      return 'mdi:file-image-box';
    case 'zip':
    case 'rar':
    case '7z':
      return 'mdi:file-archive-box';
    case 'txt':
      return 'mdi:file-text-box';
    case 'html':
    case 'css':
    case 'js':
      return 'mdi:file-code-box';
    case 'mail':
    case 'email':
      return 'mdi:email';
    default:
      return 'mdi:file-document-box';
  }
};

// Helper function to get file icon color based on extension
export const getFileIconColor = (extension: string): string => {
  const ext = extension?.toLowerCase() || '';

  switch (ext) {
    case 'pdf':
      return '#f44336';
    case 'doc':
    case 'docx':
      return '#2196f3';
    case 'xls':
    case 'xlsx':
      return '#4caf50';
    case 'ppt':
    case 'pptx':
      return '#ff9800';
    case 'mail':
    case 'email':
      return '#9C27B0';
    default:
      return '#1976d2';
  }
};

// Helper function to format date strings
export const formatDate = (dateString: string): string => {
  if (!dateString) return 'N/A';

  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch (e) {
    return 'N/A';
  }
};

// Generate a truncated preview of the content
export const getContentPreview = (content: string, maxLength: number = 220): string => {
  if (!content) return '';
  return content.length > maxLength ? `${content.substring(0, maxLength)}...` : content;
};

// Get source icon based on origin/connector
export const getSourceIcon = (
  result: SearchResult,
  theme: any
): { icon: string; color: string } => {
  if (!result?.metadata) {
    return { icon: 'mdi:database', color: theme.palette.text.secondary };
  }

  if (result.metadata.recordType === 'MAIL' || result.metadata.connector === 'GMAIL') {
    return { icon: 'mdi:gmail', color: '#EA4335' };
  }

  switch (result.metadata.connector) {
    case 'DRIVE':
      return { icon: 'mdi:google-drive', color: '#4285F4' };
    case 'SLACK':
      return { icon: 'mdi:slack', color: '#4A154B' };
    case 'JIRA':
      return { icon: 'mdi:jira', color: '#0052CC' };
    case 'TEAMS':
      return { icon: 'mdi:microsoft-teams', color: '#6264A7' };
    case 'ONEDRIVE':
      return { icon: 'mdi:microsoft-onedrive', color: '#0078D4' };
    default:
      return { icon: 'mdi:database', color: theme.palette.text.secondary };
  }
};

// Helper for highlighting search text
export const highlightText = (text: string, query: string, theme: any) => {
  if (!query || !text) return text;

  try {
    const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));

    return parts.map((part, index) =>
      part.toLowerCase() === query.toLowerCase() ? (
        <mark
          key={index}
          style={{
            backgroundColor: alpha(theme.palette.warning.light, 0.4),
            padding: '0 2px',
            borderRadius: '2px',
            color: theme.palette.text.primary,
          }}
        >
          {part}
        </mark>
      ) : (
        part
      )
    );
  } catch (e) {
    return text;
  }
};

// Main KnowledgeSearch component
const KnowledgeSearch = ({
  searchResults,
  loading,
  onSearchQueryChange,
  onTopKChange,
  onViewCitations,
  recordsMap,
}: KnowledgeSearchProps) => {
  const theme = useTheme();
  const [searchInputValue, setSearchInputValue] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeTab, setActiveTab] = useState<number>(0);
  const [selectedRecord, setSelectedRecord] = useState<SearchResult | null>(null);
  const [detailsOpen, setDetailsOpen] = useState<boolean>(false);
  const navigate = useNavigate();
  const observer = useRef<IntersectionObserver | null>(null);
  const users = useUsers();
  const [hasSearched, setHasSearched] = useState<boolean>(false);

  // Synchronize searchQuery with parent component's state
  useEffect(() => {
    // Update the input value when the parent's query changes
    if (searchQuery !== searchInputValue) {
      setSearchInputValue(searchQuery);
    }
    // eslint-disable-next-line
  }, [searchQuery]);

  const handleViewCitations = (record: SearchResult, event: React.MouseEvent) => {
    // Prevent event bubbling to card click handler
    event.stopPropagation();

    const recordId = record.metadata?.recordId || '';
    const extension = record.metadata?.extension || '';

    const isPdf = extension.toLowerCase() === 'pdf';
    const isExcel = ['xlsx', 'xls', 'csv'].includes(extension.toLowerCase());

    if (isPdf || isExcel) {
      if (onViewCitations) {
        onViewCitations(recordId, isPdf, isExcel);
      }
    }
  };

  const lastResultElementRef = useCallback(
    (node: Element | null) => {
      if (loading) return;
      if (observer.current) observer.current.disconnect();
      observer.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && onTopKChange) {
          onTopKChange((prevTopK: number) => prevTopK + 10);
        }
      });
      if (node) observer.current.observe(node);
    },
    [loading, onTopKChange]
  );

  const handleSearch = () => {
    setSearchQuery(searchInputValue);
    setHasSearched(true);
    if (onSearchQueryChange) {
      onSearchQueryChange(searchInputValue);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchInputValue(e.target.value);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const clearSearch = () => {
    setSearchInputValue('');
    setSearchQuery('');
    if (onSearchQueryChange) {
      onSearchQueryChange('');
    }
  };

  const handleRecordClick = (record: SearchResult): void => {
    const { recordId } = record.metadata;
    const recordMeta = recordsMap[recordId];
    const { webUrl } = recordMeta;
    window.open(webUrl, '_blank'); // Opens in a new tab/window
  };

  // Function to get record details for metadata display
  // const getRecordDetails = (recordId: string): any => {
  //   try {
  //     const record = recordsMap[recordId];
  //     if (!record) return null;

  //     const fullRecord = searchResults?.records?.find((r: Record) => r._id === recordId);
  //     const fileRecord = searchResults?.fileRecords?.find(
  //       (fr: FileRecord) => fr._id === record.metadata?.fileRecordId
  //     );

  //     return {
  //       modules: fullRecord?.modules || [],
  //       searchTags: fullRecord?.searchTags || [],
  //       version: fullRecord?.version,
  //       uploadedBy: fileRecord?.uploadedBy,
  //     };
  //   } catch (error) {
  //     console.error('Error getting record details:', error);
  //     return null;
  //   }
  // };

  // Get the number of records by type
  const getRecordTypeCount = (type: string): number =>
    searchResults.filter((r) => r.metadata?.recordType === type).length;

  // Get categories by record type for the tabs
  const documentCount = getRecordTypeCount('FILE');
  const faqCount = getRecordTypeCount('FAQ');
  const emailCount = getRecordTypeCount('MAIL');

  // Helper function to render uploaded by information
  // const renderUploadedBy = (recordId: string): React.ReactNode => {
  //   const details = getRecordDetails(recordId);
  //   if (!details) return <Typography variant="body2">N/A</Typography>;

  //   const uploadedById = details.uploadedBy;
  //   const user = users.find((u) => u._id === uploadedById);

  //   if (!user) return <Typography variant="body2">N/A</Typography>;

  //   return (
  //     <>
  //       <Avatar sx={{ width: 24, height: 24 }}>{user.fullName.charAt(0)}</Avatar>
  //       <Typography variant="body2">{user.fullName}</Typography>
  //     </>
  //   );
  // };

  // Show different UI states based on search state
  const showInitialState = !hasSearched && searchResults.length === 0;
  const showNoResultsState = hasSearched && searchResults.length === 0 && !loading;
  const showResultsState = searchResults.length > 0;
  const showLoadingState = loading && !showResultsState;

  return (
    <Box
      sx={{
        height: '100%',
        width: '100%',
        bgcolor: theme.palette.background.default,
        overflow: 'hidden',
      }}
    >
      <Box sx={{ px: 3, py: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Header Section */}
        <Box>
          <Typography variant="h5" sx={{ mb: 1, fontWeight: 600 }}>
            Knowledge Search
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Search across your organization&apos;s knowledge base to find documents, FAQs, and other
            resources
          </Typography>

          {/* Search Bar */}
          <Paper
            sx={{
              p: 1.5,
              mb: 2,
              boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
              borderRadius: '8px',
              border: `1px solid ${alpha(theme.palette.divider, 0.5)}`,
            }}
          >
            <Box sx={{ display: 'flex', gap: 1.5 }}>
              <TextField
                fullWidth
                value={searchInputValue}
                onChange={handleInputChange}
                onKeyPress={handleKeyPress}
                placeholder="Search for documents, topics, or keywords..."
                variant="outlined"
                size="small"
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: '6px',
                  },
                }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Icon icon="mdi:magnify" style={{ color: theme.palette.text.secondary }} />
                    </InputAdornment>
                  ),
                  endAdornment: searchInputValue && (
                    <InputAdornment position="end">
                      <IconButton
                        size="small"
                        onClick={() => setSearchInputValue('')}
                        sx={{ color: theme.palette.text.secondary }}
                      >
                        <Icon icon="mdi:close" fontSize="small" />
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
              <Button
                variant="contained"
                onClick={handleSearch}
                disabled={!searchInputValue.trim() || loading}
                sx={{
                  minWidth: '100px',
                  borderRadius: '6px',
                  boxShadow: 'none',
                  textTransform: 'none',
                  fontWeight: 500,
                  '&:hover': {
                    boxShadow: 'none',
                  },
                }}
              >
                {loading ? <CircularProgress size={20} color="inherit" sx={{ mx: 1 }} /> : 'Search'}
              </Button>
            </Box>
          </Paper>
        </Box>

        {/* Results Section - Flexbox to take remaining height */}
        <Box
          sx={{
            flexGrow: 1,
            display: 'flex',
            overflow: 'hidden',
          }}
        >
          {/* Results Column */}
          <Box
            sx={{
              width: detailsOpen ? '55%' : '100%',
              overflow: 'auto',
              transition: 'width 0.25s ease-in-out',
              pr: 1,
            }}
          >
            {/* Loading State */}
            {showLoadingState && (
              <Box sx={{ mt: 2 }}>
                {[1, 2, 3].map((item) => (
                  <Paper
                    key={item}
                    elevation={0}
                    sx={{
                      p: 2,
                      mb: 2,
                      borderRadius: '8px',
                      border: `1px solid ${alpha(theme.palette.divider, 0.5)}`,
                    }}
                  >
                    <Box sx={{ display: 'flex', gap: 2 }}>
                      <Skeleton
                        variant="rounded"
                        width={40}
                        height={40}
                        sx={{ borderRadius: '6px' }}
                      />
                      <Box sx={{ flex: 1 }}>
                        <Skeleton variant="text" width="60%" height={24} />
                        <Skeleton variant="text" width="30%" height={20} sx={{ mb: 1 }} />
                        <Skeleton variant="text" width="90%" height={16} />
                        <Skeleton variant="text" width="85%" height={16} />
                        <Skeleton variant="text" width="70%" height={16} />
                      </Box>
                    </Box>
                  </Paper>
                ))}
              </Box>
            )}

            {/* Empty State - No Results */}
            {showNoResultsState && (
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  p: 4,
                  mt: 2,
                  border: `1px solid ${alpha(theme.palette.divider, 0.5)}`,
                  borderRadius: '8px',
                  bgcolor: alpha(theme.palette.background.paper, 0.5),
                }}
              >
                <Icon
                  icon="mdi:file-search-outline"
                  style={{ fontSize: 48, color: theme.palette.text.secondary, marginBottom: 16 }}
                />
                <Typography variant="h6" sx={{ mb: 1, fontWeight: 500 }}>
                  No results found
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ textAlign: 'center', mb: 2, maxWidth: '400px' }}
                >
                  We couldn&apos;t find any matches for &quot;{searchQuery}&quot;. Try adjusting
                  your search terms or filters.
                </Typography>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<Icon icon="mdi:refresh" />}
                  onClick={clearSearch}
                  sx={{
                    borderRadius: '6px',
                    textTransform: 'none',
                    px: 2,
                  }}
                >
                  Clear search
                </Button>
              </Box>
            )}

            {/* Empty State - Initial */}
            {showInitialState && (
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  p: 4,
                  mt: 2,
                  border: `1px solid ${alpha(theme.palette.divider, 0.5)}`,
                  borderRadius: '8px',
                  bgcolor: alpha(theme.palette.background.paper, 0.5),
                }}
              >
                <Icon
                  icon="mdi:lightbulb-outline"
                  style={{ fontSize: 48, color: theme.palette.primary.main, marginBottom: 16 }}
                />
                <Typography variant="h6" sx={{ mb: 1, fontWeight: 500 }}>
                  Start exploring knowledge
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ textAlign: 'center', mb: 3, maxWidth: '400px' }}
                >
                  Enter a search term above to discover documents, FAQs, and other resources from
                  your organization&apos;s knowledge base.
                </Typography>
                <Box sx={{ display: 'flex', gap: 2 }}>
                  <Button
                    variant="outlined"
                    startIcon={<Icon icon="mdi:star-outline" />}
                    sx={{
                      borderRadius: '6px',
                      textTransform: 'none',
                      fontWeight: 500,
                    }}
                  >
                    Popular topics
                  </Button>
                  <Button
                    variant="outlined"
                    startIcon={<Icon icon="mdi:history" />}
                    sx={{
                      borderRadius: '6px',
                      textTransform: 'none',
                      fontWeight: 500,
                    }}
                  >
                    Recent searches
                  </Button>
                </Box>
              </Box>
            )}

            {/* Search Results */}
            {showResultsState && (
              <Box sx={{ pt: 1 }}>
                {searchResults.map((result, index) => {
                  if (!result?.metadata) return null;

                  const sourceInfo = getSourceIcon(result, theme);
                  const fileType = result.metadata.extension?.toUpperCase() || 'DOC';
                  const isViewable =
                    result.metadata.extension === 'pdf' ||
                    ['xlsx', 'xls', 'csv'].includes(result.metadata.extension?.toLowerCase() || '');

                  return (
                    <Card
                      key={result.metadata._id || index}
                      ref={index === searchResults.length - 1 ? lastResultElementRef : null}
                      sx={{
                        mb: 2,
                        cursor: 'pointer',
                        borderRadius: '8px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                        border:
                          selectedRecord?.metadata?._id === result.metadata._id
                            ? `1px solid ${theme.palette.primary.main}`
                            : `1px solid ${alpha(theme.palette.divider, 0.5)}`,
                        '&:hover': {
                          borderColor: theme.palette.primary.main,
                          boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
                        },
                        transition: 'all 0.2s ease-in-out',
                      }}
                      onClick={() => handleRecordClick(result)}
                    >
                      <CardContent sx={{ p: 2 }}>
                        <Box sx={{ display: 'flex', gap: 2 }}>
                          {/* Document Icon */}
                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: 40,
                              height: 40,
                              borderRadius: '6px',
                              // bgcolor: alpha(
                              //   getFileIconColor(result.metadata.extension || ''),
                              //   0.1
                              // ),
                              flexShrink: 0,
                            }}
                          >
                            <Tooltip
                              title={
                                result.metadata.origin === ORIGIN.UPLOAD
                                  ? 'Local KB'
                                  : result.metadata.connector ||
                                    result.metadata.origin ||
                                    'Document'
                              }
                            >
                              <Icon
                                icon={sourceInfo.icon}
                                style={{ fontSize: 26, color: sourceInfo.color }}
                              />
                            </Tooltip>
                          </Box>

                          {/* Content */}
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            {/* Header with Title and Meta */}
                            <Box
                              sx={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'flex-start',
                              }}
                            >
                              <Typography variant="subtitle1" fontWeight={500} sx={{ pr: 2 }}>
                                {result.metadata.recordName || 'Untitled Document'}
                              </Typography>

                              {/* Meta Icons */}
                              <Box
                                sx={{
                                  display: 'flex',
                                  gap: 1,
                                  alignItems: 'center',
                                  flexShrink: 0,
                                }}
                              >
                                {isViewable && (
                                  <Button
                                    size="small"
                                    variant="outlined"
                                    startIcon={<Icon icon="mdi:eye-outline" />}
                                    onClick={(e) => handleViewCitations(result, e)}
                                    sx={{
                                      fontSize: '0.75rem',
                                      py: 0.5,
                                      height: 24,
                                      minWidth: 0,
                                      textTransform: 'none',
                                      borderRadius: '4px',
                                    }}
                                  >
                                    View Citations
                                  </Button>
                                )}

                                {/* <Tooltip
                                  title={
                                    result.metadata.connector ||
                                    result.metadata.origin ||
                                    'Document'
                                  }
                                >
                                  <Icon
                                    icon={sourceInfo.icon}
                                    style={{ fontSize: 18, color: sourceInfo.color }}
                                  />
                                </Tooltip> */}

                                <Chip
                                  label={fileType}
                                  size="small"
                                  sx={{
                                    height: 20,
                                    fontSize: '0.7rem',
                                    borderRadius: '4px',
                                  }}
                                />
                              </Box>
                            </Box>

                            {/* Metadata Line */}
                            <Box
                              sx={{ display: 'flex', gap: 2, alignItems: 'center', mt: 0.5, mb: 1 }}
                            >
                              <Typography variant="caption" color="text.secondary">
                                {formatDate(new Date().toISOString())}
                              </Typography>

                              <Divider orientation="vertical" flexItem sx={{ height: 12 }} />

                              <Typography variant="caption" color="text.secondary">
                                {result.metadata.categories || 'General'}
                              </Typography>

                              {result.metadata.pageNum && (
                                <>
                                  <Divider orientation="vertical" flexItem sx={{ height: 12 }} />
                                  <Typography variant="caption" color="text.secondary">
                                    Page {result.metadata.pageNum}
                                  </Typography>
                                </>
                              )}
                            </Box>

                            {/* Content Preview */}
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                              {highlightText(getContentPreview(result.content), searchQuery, theme)}
                            </Typography>

                            {/* Tags and Departments */}
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                              {result.metadata.topics &&
                                result.metadata.topics.slice(0, 3).map((topic) => (
                                  <Chip
                                    key={topic}
                                    label={topic}
                                    size="small"
                                    sx={{
                                      height: 20,
                                      fontSize: '0.7rem',
                                      borderRadius: '4px',
                                    }}
                                  />
                                ))}

                              {result.metadata.departments &&
                                result.metadata.departments.slice(0, 2).map((dept) => (
                                  <Chip
                                    key={dept}
                                    label={dept}
                                    size="small"
                                    variant="outlined"
                                    sx={{
                                      height: 20,
                                      fontSize: '0.7rem',
                                      borderRadius: '4px',
                                    }}
                                  />
                                ))}

                              {((result.metadata.topics?.length || 0) > 3 ||
                                (result.metadata.departments?.length || 0) > 2) && (
                                <Chip
                                  label={`+${(result.metadata.topics?.length || 0) - 3 + ((result.metadata.departments?.length || 0) - 2)} more`}
                                  size="small"
                                  sx={{
                                    height: 20,
                                    fontSize: '0.7rem',
                                    borderRadius: '4px',
                                  }}
                                />
                              )}
                            </Box>
                          </Box>
                        </Box>
                      </CardContent>
                    </Card>
                  );
                })}

                {/* Loading Indicator at Bottom */}
                {loading && searchResults.length > 0 && (
                  <Box
                    sx={{
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                      p: 2,
                      gap: 1,
                    }}
                  >
                    <CircularProgress size={16} />
                    <Typography variant="body2" color="text.secondary">
                      Loading more results...
                    </Typography>
                  </Box>
                )}
              </Box>
            )}
          </Box>

          {/* Details Column - This would be where DetailPanel is rendered */}
          {detailsOpen && selectedRecord && (
            <Box sx={{ width: '45%', position: 'relative' }}>{/* DetailPanel would go here */}</Box>
          )}
        </Box>
      </Box>
    </Box>
  );
};

export default KnowledgeSearch;
