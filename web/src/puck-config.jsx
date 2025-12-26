import { DropZone } from "@measured/puck";

export const config = {
  components: {
    Header: {
      fields: {
        title: {
          type: "text",
          label: "Dashboard Title"
        },
        showBell: {
          type: "radio",
          options: [
            { label: "Show", value: true },
            { label: "Hide", value: false }
          ]
        }
      },
      defaultProps: {
        title: "🔔 NotifyHub",
        showBell: true
      },
      render: ({ title, showBell }) => (
        <h1 className={`mb-4 text-2xl font-bold dark:text-white ${showBell ? '' : 'text-center'}`}>
          {showBell ? title : title.replace('🔔 ', '')}
        </h1>
      )
    },
    ConnectionStatus: {
      fields: {
        showBanner: {
          type: "radio",
          options: [
            { label: "Show", value: true },
            { label: "Hide", value: false }
          ]
        }
      },
      defaultProps: {
        showBanner: true
      },
      render: ({ showBanner, connectionError }) => (
        showBanner && connectionError ? (
          <div className="alert alert-warning mb-3 dark:bg-yellow-900 dark:text-yellow-100 dark:border-yellow-700">
            Connection lost - retrying...
          </div>
        ) : null
      )
    },
    NotificationList: {
      fields: {
        cardStyle: {
          type: "select",
          options: [
            { label: "White Cards", value: "white" },
            { label: "Gray Cards", value: "gray" },
            { label: "Dark Cards", value: "dark" },
            { label: "Bordered Cards", value: "bordered" }
          ]
        },
        maxWidth: {
          type: "text",
          label: "Max Card Width"
        }
      },
      defaultProps: {
        cardStyle: "dark",
        maxWidth: "95%"
      },
      render: ({ cardStyle, maxWidth, notifications, formatDate, clearAllNotifications }) => (
        <div className="row">
          <div className="col-12 px-2">
            <div className="flex justify-end mb-3">
              <button
                onClick={clearAllNotifications}
                className="btn btn-outline-danger btn-sm"
                disabled={notifications.length === 0}
              >
                Clear All
              </button>
            </div>
            <div>
              {notifications.map(notification => (
                <div
                  key={notification.id}
                  className={`card mb-2 mx-auto ${
                    cardStyle === 'white' ? 'bg-white dark:bg-gray-800' :
                    cardStyle === 'gray' ? 'bg-gray-100 dark:bg-gray-700' :
                    cardStyle === 'dark' ? 'bg-gray-800' :
                    'border border-gray-300 dark:border-gray-600'
                  }`}
                  style={{ width: maxWidth, maxWidth }}
                >
                  <div className="card-body">
                    <div className="flex justify-between">
                      <div>
                        <h6 className="card-title font-bold dark:text-white">{notification.message}</h6>
                         <small className="text-muted dark:text-gray-300">
                           {formatDate(notification.timestamp)}
                         </small>
                      </div>
                      <span className="text-primary">🔔</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )
    },
    Dashboard: {
      fields: {},
      render: ({ children }) => (
        <div className="container mt-4">
          <DropZone zone="content" />
        </div>
      )
    }
  }
};