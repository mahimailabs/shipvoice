from src.agents.assistant import Assistant


def test_assistant_constructs_with_instructions():
    agent = Assistant(agent_name="Mahi")
    assert "Mahi" in agent.instructions
    assert "{agent_name}" not in agent.instructions
