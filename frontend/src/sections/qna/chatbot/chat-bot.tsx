import type {
  Message,
  Citation,
  Conversation,
  CustomCitation,
  FormattedMessage,
  ExpandedCitationsState,
  Metadata,
} from 'src/types/chat-bot';
import { ORIGIN } from 'src/sections/knowledgebase/constants/knowledge-search';
import { CONFIG } from 'src/config-global';
import { Icon } from '@iconify/react';
import { useParams, useNavigate } from 'react-router';
import React, { useState, useEffect, useCallback } from 'react';

import { Box, Button, styled, Tooltip, IconButton, CircularProgress } from '@mui/material';

import axios from 'src/utils/axios';

import ChatInput from './components/chat-input';
import ChatSidebar from './components/chat-sidebar';
import ExcelViewer from './components/excel-highlighter';
import ChatMessagesArea from './components/chat-message-area';
import PdfHighlighterComp from './components/pdf-highlighter';

const DRAWER_WIDTH = 300;

const StyledCloseButton = styled(Button)(({ theme }) => ({
  position: 'fixed',
  top: 60,
  right: 32,
  backgroundColor: theme.palette.primary.main,
  color: theme.palette.primary.contrastText,
  textTransform: 'none',
  padding: '6px 12px',
  minWidth: 'auto',
  fontSize: '0.875rem',
  fontWeight: 600,
  zIndex: 9999,
  borderRadius: theme.shape.borderRadius,
  boxShadow: theme.shadows[2],
  '&:hover': {
    backgroundColor: theme.palette.primary.dark,
    boxShadow: theme.shadows[4],
  },
  '& .MuiSvgIcon-root': {
    color: theme.palette.primary.contrastText,
  },
}));

const StyledOpenButton = styled(IconButton)(({ theme }) => ({
  position: 'absolute',
  top: 78,
  left: 14,
  zIndex: 1100,
  padding: '6px',
  color: theme.palette.text.secondary,
  backgroundColor: 'transparent',
  border: `1px solid ${theme.palette.divider}`,
  borderRadius: theme.shape.borderRadius,
  transition: 'all 0.2s ease',
  '&:hover': {
    backgroundColor: theme.palette.action.hover,
    color: theme.palette.primary.main,
  },
}));

const ChatInterface = () => {
  // const [searchQuery, setSearchQuery] = useState<string>('');
  const [messages, setMessages] = useState<FormattedMessage[]>([]);
  const [inputValue, setInputValue] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isLoadingConversation, setIsLoadingConversation] = useState<boolean>(false);
  const [expandedCitations, setExpandedCitations] = useState<ExpandedCitationsState>({});
  const [isDrawerOpen, setDrawerOpen] = useState<boolean>(true);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  // eslint-disable-next-line
  const [selectedChat, setSelectedChat] = useState<Conversation | null>(null);
  const [shouldRefreshSidebar, setShouldRefreshSidebar] = useState<boolean>(false);
  const navigate = useNavigate();
  const { conversationId } = useParams<{ conversationId: string }>();
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [aggregatedCitations, setAggregatedCitations] = useState<CustomCitation[] | null>([]);
  const [openPdfView, setOpenPdfView] = useState<boolean>(false);
  // const [showQuestionDetails, setShowQuestionDetails] = useState<boolean>(false);
  const [isExcel, setIsExcel] = useState<boolean>(false);
  const [isViewerReady, setIsViewerReady] = useState<boolean>(false);
  const [transitioning, setTransitioning] = useState<boolean>(false);
  const [fileBuffer, setFileBuffer] = useState<ArrayBuffer>();
  const [isPdf, setIsPdf] = useState<boolean>(false);

  const formatMessage = useCallback((apiMessage: Message): FormattedMessage | null => {
    if (!apiMessage) return null;

    // Common base message properties
    const baseMessage = {
      id: apiMessage._id,
      timestamp: new Date(apiMessage.createdAt || new Date()),
      content: apiMessage.content || '',
      type: apiMessage.messageType === 'user_query' ? 'user' : 'bot',
      contentFormat: apiMessage.contentFormat || 'MARKDOWN',
      followUpQuestions: apiMessage.followUpQuestions || [],
      createdAt: apiMessage.createdAt ? new Date(apiMessage.createdAt) : new Date(),
      updatedAt: apiMessage.updatedAt ? new Date(apiMessage.updatedAt) : new Date(),
    };

    // For user messages
    if (apiMessage.messageType === 'user_query') {
      return {
        ...baseMessage,
        type: 'user',
        feedback: apiMessage.feedback || [],
      };
    }

    // For bot messages
    if (apiMessage.messageType === 'bot_response') {
      return {
        ...baseMessage,
        type: 'bot',
        confidence: apiMessage.confidence || '',
        citations: (apiMessage.citations || []).map((citation: Citation) => ({
          id: citation.citationId,
          _id: citation.citationData?._id || citation.citationId,
          citationId: citation.citationId,
          content: citation.citationData.content || '',
          metadata: citation.citationData.metadata || [],
          orgId: citation.orgId,
          citationType: citation.citationType,
          createdAt: citation.citationData?.createdAt || new Date().toISOString(),
          updatedAt: citation.citationData?.updatedAt || new Date().toISOString(),
          chunkIndex: citation.citationData.chunkIndex || 1,
        })),
      };
    }

    return null;
  }, []);
  const resetViewerStates = () => {
    setTransitioning(true);
    setIsViewerReady(false);
    setPdfUrl(null);

    // Delay clearing other states to ensure clean unmount
    setTimeout(() => {
      setOpenPdfView(false);
      setIsExcel(false);
      setAggregatedCitations(null);
      setTransitioning(false);
    }, 100);
  };

  const onViewPdf = async (
    url: string,
    citationMeta: Metadata,
    citations: CustomCitation[],
    isExcelFile: boolean = false,
    bufferData?: ArrayBuffer
  ): Promise<void> => {
    // setAggregatedCitations(citations);
    // setPdfUrl(url);
    // setOpenPdfView(true);
    // console.log(aggregatedCitations);
    // setShowQuestionDetails(true);
    // // setDrawerOpen(false);
    setTransitioning(true);
    setIsViewerReady(false);
    setDrawerOpen(false);
    setOpenPdfView(true);
    setAggregatedCitations(citations);

    try {
      const isExcelOrCSV = ['CSV', 'xlsx', 'xls'].includes(citationMeta?.extension);
      setIsExcel(isExcelOrCSV);
      setIsPdf(citationMeta?.extension === 'pdf');
      const recordId = citationMeta?.recordId;
      const response = await axios.get(`/api/v1/knowledgebase/record/${recordId}`);
      const { record } = response.data;
      const { externalRecordId } = record;
      const fileName = record.recordName;
      if (record.origin === ORIGIN.UPLOAD) {
        try {
          const downloadResponse = await axios.get(
            `/api/v1/document/${externalRecordId}/download`,
            { responseType: 'blob' }
          );

          // Read the blob response as text to check if it's JSON with signedUrl
          const reader = new FileReader();
          const textPromise = new Promise<string>((resolve) => {
            reader.onload = () => {
              resolve(reader.result?.toString() || '');
            };
          });

          reader.readAsText(downloadResponse.data);
          const text = await textPromise;

          let filename = fileName || `document-${externalRecordId}`;
          const contentDisposition = downloadResponse.headers['content-disposition'];
          if (contentDisposition) {
            const filenameMatch = contentDisposition.match(/filename="?([^"]*)"?/);
            if (filenameMatch && filenameMatch[1]) {
              filename = filenameMatch[1];
            }
          }

          try {
            // Try to parse as JSON to check for signedUrl property
            const jsonData = JSON.parse(text);
            if (jsonData && jsonData.signedUrl) {
              setPdfUrl(jsonData.signedUrl);
            }
          } catch (e) {
            // Case 2: Local storage - Return buffer
            const bufferReader = new FileReader();
            const arrayBufferPromise = new Promise<ArrayBuffer>((resolve) => {
              bufferReader.onload = () => {
                resolve(bufferReader.result as ArrayBuffer);
              };
              bufferReader.readAsArrayBuffer(downloadResponse.data);
            });

            const buffer = await arrayBufferPromise;
            setFileBuffer(buffer);
          }
        } catch (error) {
          console.error('Error downloading document:', error);
          throw new Error('Failed to download document');
        }
      } else if (record.origin === ORIGIN.CONNECTOR) {
        try {
          const connectorResponse = await axios.get(
            `${CONFIG.backendUrl}/api/v1/knowledgeBase/stream/record/${recordId}`,
            {
              responseType: 'blob',
            }
          );

          // Extract filename from content-disposition header
          let filename = record.recordName || `document-${recordId}`;
          const contentDisposition = connectorResponse.headers['content-disposition'];
          if (contentDisposition) {
            const filenameMatch = contentDisposition.match(/filename="?([^"]*)"?/);
            if (filenameMatch && filenameMatch[1]) {
              filename = filenameMatch[1];
            }
          }

          // Convert blob directly to ArrayBuffer
          const bufferReader = new FileReader();
          const arrayBufferPromise = new Promise<ArrayBuffer>((resolve, reject) => {
            bufferReader.onload = () => {
              // Create a copy of the buffer to prevent detachment issues
              const originalBuffer = bufferReader.result as ArrayBuffer;
              const bufferCopy = originalBuffer.slice(0);
              resolve(bufferCopy);
            };
            bufferReader.onerror = () => {
              reject(new Error('Failed to read blob as array buffer'));
            };
            bufferReader.readAsArrayBuffer(connectorResponse.data);
          });

          const buffer = await arrayBufferPromise;
          setFileBuffer(buffer);
        } catch (err) {
          console.error('Error downloading document:', err);
          throw new Error(`Failed to download document: ${err.message}`);
        }
      }
    } catch (err) {
      console.error('Failed to fetch document:', err);
    }

    if (openPdfView && isExcel !== isExcelFile) {
      setPdfUrl(null);
      setAggregatedCitations(null);

      // Wait for unmount
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Set new viewer states
    // setIsExcel(isExcelFile);
    // setPdfUrl(url);
    // setFileBuffer(buffer);

    // Allow component to mount
    setTimeout(() => {
      setIsViewerReady(true);
      setTransitioning(false);
    }, 100);
  };

  const onClosePdf = (): void => {
    // setOpenPdfView(false);
    // setIsExcel(false);
    // setShowQuestionDetails(false);

    // setTimeout(() => {
    //   setPdfUrl(null);
    //   setAggregatedCitations([]);
    // }, 50); // Match this with your transition duration
    resetViewerStates();
  };

  // const onViewPdf = (url, citations) => {
  //   setAggregatedCitations(citations);
  //   setPdfUrl(url);
  //   setOpenPdfView(true);
  //   setDrawerOpen(false);
  // };

  // const onClosePdf = () => {
  //   setOpenPdfView(false);
  // };

  // Also update the toggleCitations function to handle citation state more explicitly
  const toggleCitations = useCallback((index: number): void => {
    setExpandedCitations((prev) => {
      const newState = { ...prev };
      newState[index] = !prev[index];
      return newState;
    });
  }, []);

  // Handle new chat creation
  const handleNewChat = useCallback((): void => {
    setCurrentConversationId(null);
    setSelectedChat(null);
    setMessages([]);
    setExpandedCitations({});
    setInputValue('');
    setShouldRefreshSidebar(true);
    navigate(`/`); // Navigate to base chat route
  }, [navigate]);

  const handleSendMessage = useCallback(async (): Promise<void> => {
    const trimmedInput = inputValue.trim();
    if (!trimmedInput || isLoading) return;

    const tempUserMessage = {
      type: 'user',
      content: trimmedInput,
      createdAt: new Date(),
      updatedAt: new Date(),
      id: `temp-${Date.now()}`,
      contentFormat: 'MARKDOWN',
      followUpQuestions: [],
      citations: [],
      feedback: [],
      messageType: 'user_query',
      timestamp: new Date(),
    };

    try {
      setIsLoading(true);
      setInputValue('');

      let response;
      if (!currentConversationId) {
        // Create new conversation
        response = await axios.post<{ conversation: Conversation }>(
          '/api/v1/conversations/create',
          {
            query: trimmedInput,
          }
        );

        if (!response?.data?.conversation) {
          throw new Error('Invalid response format');
        }

        const { conversation } = response.data;
        setSelectedChat(conversation);
        setCurrentConversationId(conversation._id);
        setShouldRefreshSidebar(true);
        navigate(`/${conversation._id}`);

        // For new conversation, get all messages in order
        const formattedMessages = conversation.messages
          .map(formatMessage)
          .filter(Boolean) as FormattedMessage[];
        setMessages(formattedMessages);
      } else {
        // For existing conversation, append messages in order
        setMessages((prev) => [...prev, tempUserMessage]);

        // Continue existing conversation
        response = await axios.post<{ conversation: Conversation }>(
          `/api/v1/conversations/${currentConversationId}/messages`,
          { query: trimmedInput }
        );

        if (!response?.data?.conversation?.messages) {
          throw new Error('Invalid response format');
        }

        // Get the bot response and append it
        const botMessage = response.data.conversation.messages
          .filter((msg) => msg.messageType === 'bot_response')
          .map(formatMessage)
          .pop();

        if (botMessage) {
          setMessages((prev) => [...prev, botMessage]);
        }
      }

      // Update citation states
      const lastMessage =
        response.data.conversation.messages[response.data.conversation.messages.length - 1];
      if (lastMessage?.citations?.length > 0) {
        setExpandedCitations((prev) => ({
          ...prev,
          [messages.length]: false,
        }));
      }
    } catch (error) {
      const errorMessage: FormattedMessage = {
        type: 'bot',
        content: 'Sorry, I encountered an error processing your request.',
        createdAt: new Date(),
        updatedAt: new Date(),
        id: `error-${Date.now()}`,
        contentFormat: 'MARKDOWN',
        followUpQuestions: [],
        citations: [],
        confidence: '',
        messageType: 'bot_response',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  }, [inputValue, isLoading, currentConversationId, formatMessage, navigate, messages]);

  // Update handleRegenerateMessage
  const handleRegenerateMessage = useCallback(
    async (messageId: string): Promise<void> => {
      if (!currentConversationId || !messageId) return;

      try {
        setIsLoading(true);
        const response = await axios.post<{ conversation: Conversation }>(
          `/api/v1/conversations/${currentConversationId}/message/${messageId}/regenerate`,
          { instruction: 'Improve writing style and clarity' }
        );

        if (!response?.data?.conversation?.messages) {
          throw new Error('Invalid response format');
        }

        // Format all messages from response
        const allMessages = response.data.conversation.messages
          .map(formatMessage)
          .filter(Boolean) as FormattedMessage[];

        // Find the regenerated message - it should be the last bot message
        const regeneratedMessage = allMessages.filter((msg) => msg.type === 'bot').pop();

        if (!regeneratedMessage) {
          throw new Error('No regenerated message found in response');
        }

        // Update messages by replacing only the regenerated message while keeping all others
        setMessages((prevMessages) =>
          prevMessages.map((msg) => {
            // Only replace the message that was regenerated
            if (msg.id === messageId) {
              return {
                ...regeneratedMessage,
                // Keep any existing metadata/state that shouldn't be changed
                createdAt: msg.createdAt, // Preserve original timestamp to maintain order
              };
            }
            return msg;
          })
        );

        // Update citation states
        setExpandedCitations((prevStates) => {
          const newStates = { ...prevStates };
          const messageIndex = messages.findIndex((msg) => msg.id === messageId);
          if (messageIndex !== -1) {
            // Safely check citations array existence and length
            const hasCitations =
              regeneratedMessage.citations && regeneratedMessage.citations.length > 0;
            // Preserve existing citation state or initialize to false
            newStates[messageIndex] = hasCitations ? prevStates[messageIndex] || false : false;
          }
          return newStates;
        });
      } catch (error) {
        // Show error in place of regenerated message while preserving others
        setMessages((prevMessages) =>
          prevMessages.map((msg) =>
            msg.id === messageId
              ? {
                  ...msg,
                  content: 'Sorry, I encountered an error regenerating this message.',
                  error: true,
                }
              : msg
          )
        );
      } finally {
        setIsLoading(false);
      }
    },
    [currentConversationId, formatMessage, messages]
  );

  const handleChatSelect = useCallback(
    async (chat: Conversation) => {
      if (!chat?._id) return;

      try {
        setIsLoadingConversation(true);
        setMessages([]);
        setExpandedCitations({});
        navigate(`/${chat._id}`);
        const response = await axios.get(`/api/v1/conversations/${chat._id}`);
        const { conversation } = response.data;

        if (!conversation || !Array.isArray(conversation.messages)) {
          throw new Error('Invalid conversation data');
        }

        // Set complete conversation data
        setSelectedChat(conversation);

        setCurrentConversationId(conversation.id);

        // Format messages and preserve full data structure
        const formattedMessages = conversation.messages
          .map(formatMessage)
          .filter(Boolean) as FormattedMessage[];

        // Initialize citation states for all bot messages with citations
        const citationStates: ExpandedCitationsState = {};
        formattedMessages.forEach((msg, idx) => {
          if (msg.type === 'bot' && msg.citations && msg.citations.length > 0) {
            citationStates[idx] = false;
          }
        });

        setMessages(formattedMessages);
        setExpandedCitations(citationStates);
      } catch (error) {
        setSelectedChat(null);
        setCurrentConversationId(null);
        setMessages([]);
        setExpandedCitations({});
      } finally {
        setIsLoadingConversation(false);
      }
    },
    [formatMessage, navigate]
  );

  const handleSidebarRefreshComplete = useCallback(() => {
    setShouldRefreshSidebar(false);
  }, []);

  // Handle feedback submission
  const handleFeedbackSubmit = useCallback(
    async (messageId: string, feedback: any) => {
      if (!currentConversationId || !messageId) return;

      try {
        await axios.post(
          `/api/v1/conversations/${currentConversationId}/message/${messageId}/feedback`,
          feedback
        );
      } catch (error) {
        throw new Error('Feedback submission error');
      }
    },
    [currentConversationId]
  );

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>): void => {
    setInputValue(e.target.value);
  }, []);

  useEffect(() => {
    if (conversationId && conversationId !== currentConversationId) {
      handleChatSelect({ _id: conversationId } as Conversation);
    }
  }, [conversationId, handleChatSelect, currentConversationId]);

  return (
    <Box
      sx={{
        display: 'flex',
        width: '100%',
        height: '90vh',
        overflow: 'hidden',
      }}
    >
      {!isDrawerOpen && (
        <Tooltip title="Open Sidebar" placement="right">
          <StyledOpenButton
            onClick={() => setDrawerOpen(true)}
            size="small"
            aria-label="Open sidebar"
          >
            <Icon icon="mdi:menu" fontSize="medium" />
          </StyledOpenButton>
        </Tooltip>
      )}
      {isDrawerOpen && (
        <Box
          sx={{
            width: DRAWER_WIDTH,
            borderRight: 1,
            borderColor: 'divider',
            bgcolor: 'background.paper',
            overflow: 'hidden',
            flexShrink: 0,
          }}
        >
          <ChatSidebar
            onClose={() => setDrawerOpen(false)}
            onChatSelect={handleChatSelect}
            onNewChat={handleNewChat}
            selectedId={currentConversationId}
            shouldRefresh={shouldRefreshSidebar}
            onRefreshComplete={handleSidebarRefreshComplete}
          />
        </Box>
      )}

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: openPdfView ? '1fr 2fr' : '1fr',
          width: '100%',
          gap: 2,
          transition: 'grid-template-columns 0.3s ease',
        }}
      >
        {/* Chat Interface */}
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            minWidth: 0,
            height: '90vh',
            borderRight: openPdfView ? 1 : 0,
            borderColor: 'divider',
            marginLeft: isDrawerOpen ? 0 : 4,
          }}
        >
          {/* <Box sx={{ flexShrink: 0 }}>
            <ChatHeader
              isDrawerOpen={isDrawerOpen}
              onDrawerOpen={() => setDrawerOpen(true)}
              conversationId={currentConversationId}
            />
          </Box> */}

          <ChatMessagesArea
            messages={messages}
            isLoading={isLoading}
            expandedCitations={expandedCitations}
            onToggleCitations={toggleCitations}
            onRegenerateMessage={handleRegenerateMessage}
            onFeedbackSubmit={handleFeedbackSubmit}
            conversationId={currentConversationId}
            isLoadingConversation={isLoadingConversation}
            onViewPdf={onViewPdf}
          />

          <Box
            sx={{
              flexShrink: 0,
              borderTop: 1,
              borderColor: 'divider',
              bgcolor: 'background.paper',
              mt: 'auto',
            }}
          >
            <ChatInput
              value={inputValue}
              onChange={handleInputChange}
              onSubmit={handleSendMessage}
              isLoading={isLoading}
            />
          </Box>
        </Box>

        {/* PDF Viewer */}
        {/* PDF Viewer */}
        {openPdfView && (
          <Box
            sx={{
              height: '90vh',
              overflow: 'hidden',
              position: 'relative',
              bgcolor: 'background.default',
              '& > div': {
                height: '100%',
                width: '100%',
              },
            }}
          >
            {transitioning && (
              <Box
                sx={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor: 'background.paper',
                }}
              >
                <CircularProgress />
              </Box>
            )}

            {/* Render viewer with citations */}
            {isViewerReady &&
              (pdfUrl || fileBuffer) &&
              aggregatedCitations &&
              // !transitioning &&
              (isExcel ? (
                <ExcelViewer
                  key="excel-viewer"
                  citations={aggregatedCitations}
                  fileUrl={pdfUrl}
                  excelBuffer={fileBuffer}
                />
              ) : (
                <PdfHighlighterComp
                  key="pdf-viewer"
                  pdfUrl={pdfUrl}
                  pdfBuffer={fileBuffer}
                  citations={aggregatedCitations}
                />
              ))}
            <StyledCloseButton
              onClick={onClosePdf}
              startIcon={<Icon icon="mdi:close" />}
              size="small"
            >
              Close
            </StyledCloseButton>
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default ChatInterface;
