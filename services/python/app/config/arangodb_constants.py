from enum import Enum

class DepartmentNames(Enum):
    LEGAL = "Legal"
    COMPLIANCE_RISK = "Compliance/Risk Management"
    IT_SECURITY = "IT & Security"
    PRODUCT_MANAGEMENT = "Product Management"
    SALES = "Sales"
    ENGINEERING = "Engineering/Technology"
    HR = "Human Resources"
    PROCUREMENT = "Procurement"
    FINANCE = "Finance"
    OPERATIONS = "Operations"
    RND = "Research and Development"
    EXECUTIVE = "Executive Leadership"
    QA = "Quality Assurance"
    DEVOPS = "Devops/Site Reliability Engineering"
    LEGAL_PATENT = "Legal/Patent Management"
    FACILITIES_ADMIN = "Facilities / Administration"
    DATA_ANALYTICS = "Data Analytics / Insights"
    BUSINESS_DEV = "Business Development / Partnerships"
    ESG = "Environmental, Social, and Governance"
    TRAINING = "Training and Enablement"
    MARKETING = "Marketing"
    INVESTOR_RELATIONS = "Investor Relationss"
    CUSTOMER_SUCCESS = "Customer Success"
    OTHERS = "Others"
    
class Connectors(Enum):
    GOOGLE_DRIVE = "DRIVE"
    GOOGLE_MAIL = "GMAIL"
    GOOGLE_CALENDAR = "CALENDAR"

class RecordTypes(Enum):
    FILE = "FILE"
    ATTACHMENT = "ATTACHMENT"
    LINK = "LINK"
    MAIL = "MAIL"
    DRIVE = "DRIVE"
    
class RecordRelations(Enum):
    PARENT_CHILD = "PARENT_CHILD"
    SIBLING = "SIBLING"
    ATTACHMENT = "ATTACHMENT"
    
class OriginTypes(Enum):
    CONNECTOR = "CONNECTOR"
    UPLOAD = "UPLOAD"
    
class EventTypes(Enum):
    NEW_RECORD = "newRecord"
    UPDATE_RECORD = "updateRecord"
    DELETE_RECORD = "deleteRecord"
    
class CollectionNames(Enum):
    # Records and Record relations
    RECORDS = 'records'
    RECORD_RELATIONS = 'recordRelations'

    # Knowledge base
    KNOWLEDGE_BASE = 'knowledgeBase'
    IS_OF_TYPE = 'isOfType'
    BELONGS_TO_KNOWLEDGE_BASE = 'belongsToKnowledgeBase'
    PERMISSIONS_TO_KNOWLEDGE_BASE = 'permissionsToKnowledgeBase'

    # Drive related
    DRIVES = 'drives'
    USER_DRIVE_RELATION = 'userDriveRelation'

    # Record types
    FILES = 'files'
    ATTACHMENTS = 'attachments'
    LINKS = 'links'
    MAILS = 'mails'

    # Users and groups
    PEOPLE = 'people'
    USERS = 'users'
    GROUPS = 'groups'
    ORGS = 'organizations'
    ANYONE = 'anyone'
    BELONGS_TO = 'belongsTo'

    # Departments
    DEPARTMENTS = 'departments'
    BELONGS_TO_DEPARTMENT = 'belongsToDepartment'
    CATEGORIES = "categories"
    BELONGS_TO_CATEGORY = 'belongsToCategory'
    LANGUAGES = "languages"
    BELONGS_TO_LANGUAGE = 'belongsToLanguage'
    TOPICS = "topics"
    BELONGS_TO_TOPIC = 'belongsToTopic'
    SUBCATEGORIES1 = "subcategories1"
    SUBCATEGORIES2 = "subcategories2"
    SUBCATEGORIES3 = "subcategories3"
    INTER_CATEGORY_RELATIONS = 'interCategoryRelations'

    # Permissions
    PERMISSIONS = 'permissions'

    # Other
    CHANNEL_HISTORY = 'channelHistory'
    PAGE_TOKENS = 'pageTokens' 
    
    # Graphs
    FILE_ACCESS_GRAPH = "fileAccessGraph"

    APPS = 'apps'
    ORG_APP_RELATION = 'orgAppRelation'
    USER_APP_RELATION = 'userAppRelation'
    ORG_DEPARTMENT_RELATION = 'orgDepartmentRelation'
    
class QdrantCollectionNames(Enum):
    RECORDS = "records"
    