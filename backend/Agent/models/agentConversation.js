const Sequelize = require("sequelize");
const { sequelize } = require("../../../../../API/connection");

const AgentConversation = sequelize.define(
  "agent_conversations",
  {
    conversationId: {
      type: Sequelize.UUID,
      defaultValue: Sequelize.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    missionName: {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: "frozon",
    },
    azureThreadId: {
      type: Sequelize.STRING,
      allowNull: true,
    },
    title: {
      type: Sequelize.STRING(500),
      allowNull: true,
    },
    messages: {
      type: Sequelize.JSONB,
      allowNull: false,
      defaultValue: [],
    },
  },
  {
    timestamps: true,
  },
);

module.exports = AgentConversation;
